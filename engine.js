/* =====================================================================
   Numberblocks 忠実再現 描画エンジン（共通ファイル）

   このファイルは zukan.html（キャラメイク）と index.html（ゲーム）の
   両方から <script src> で読み込まれる。キャラの見た目に関する修正はここだけを
   直せば両方へ自動的に反映される。

   file:// で開いても動くよう、ES module ではなく普通のスクリプトとして書く
   （import は CORS でブロックされるため使えない）。
   （ファンメイドの私的利用実装。公式アートの複製ではなく、
     公開されているデザインルールに基づいて自前で描画する）
   ===================================================================== */
/* ── roundRect ポリフィル（古い WebView 対策） ────────────────────── */
if(!CanvasRenderingContext2D.prototype.roundRect){
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
    if(typeof r === 'number') r=[r,r,r,r];
    else if(!r || !r.length) r=[0,0,0,0];
    else if(r.length===1) r=[r[0],r[0],r[0],r[0]];
    else if(r.length===2) r=[r[0],r[1],r[0],r[1]];
    else if(r.length===3) r=[r[0],r[1],r[2],r[1]];
    const mx = Math.min(Math.abs(w),Math.abs(h))/2;
    r = r.map(v=>Math.min(v,mx));
    this.moveTo(x+r[0],y);
    this.lineTo(x+w-r[1],y); this.arcTo(x+w,y,x+w,y+r[1],r[1]);
    this.lineTo(x+w,y+h-r[2]); this.arcTo(x+w,y+h,x+w-r[2],y+h,r[2]);
    this.lineTo(x+r[3],y+h); this.arcTo(x,y+h,x,y+h-r[3],r[3]);
    this.lineTo(x,y+r[0]); this.arcTo(x,y,x+r[0],y,r[0]);
    this.closePath(); return this;
  };
}

/* ===================== ENGINE START ===================== */

/* ── ① 位ごとの数字で決まる色 ────────────────────────────────────
   1赤 2橙 3黄 4緑 5シアン 6藍 7にじいろ 8マゼンタ 9灰(3階調)     */
const DIGIT_COLORS = {
  1:[229, 36, 42],   // 赤
  2:[243,146, 32],   // 橙
  3:[249,214, 45],   // 黄
  4:[ 62,187, 71],   // 緑
  5:[ 41,190,226],   // シアン
  6:[ 86, 64,196],   // 藍(indigo)
  7:[255,255,255],   // にじいろ（実際は RAINBOW を使う。単色が要る時の代表色）
  8:[236, 44,140],   // マゼンタ
  9:[178,178,186]    // 灰（実際は GRAY3 を使う）
};
// 7 のにじいろ（下から 赤・橙・黄・緑・シアン・藍・紫）
const RAINBOW = [[229,36,42],[243,146,32],[249,214,45],[62,187,71],[41,190,226],[63,72,204],[146,60,192]];
// 9 の灰 3階調（明 → 暗）
const GRAY3 = [[210,210,216],[163,163,172],[112,112,124]];
// 1〜5 の原文にある固有色
const MAROON     = [122, 24, 38];   // 1 の目・口・手足の先
const PURPLE     = [112, 62, 178];  // 2 の手足・目のふち、3 の手足の先
const DARK_GREEN = [ 26, 92, 40];   // 4 の目・くちびる・手足
const NAVY       = [ 24, 44, 122];  // 5 の目・腕・脚・手袋
// 6 の固有色（公式：サイコロの目模様、6の目だけペリウィンクル・他は濃いペリウィンクル）
const PIP_LIGHT  = [205,200,255];   // 6の目（2×3）＝ペリウィンクル
const PIP_DARK   = [128,112,205];   // それ以外の目＝濃いペリウィンクル
const SIX_EYE_RIM= [150, 28, 96];   // 6 の目の輪郭・まつげ＝赤紫
const BLUEISH_GREY = [104, 118, 142]; // 9 の眉毛（公式：目と同色の青みがかったグレー）
const SIX_LIMB_A = [224, 40, 54], SIX_LIMB_B = [168, 32, 90]; // 6 の手足＝赤みの単色寄りグラデーション
// 100 の市松＋暗いフチ（公式：サーモン50個＋プース50個、マルーンのフチ。
// 目・口・手足は 1（One）と同じ赤）
const HUNDRED_A      = [250,128,114];  // サーモン
const HUNDRED_B      = [150, 85, 95];  // プース（くすんだ赤紫）
const HUNDRED_BORDER = [110, 25, 35];  // マルーン

function mixWhite(c,t){ return [Math.round(c[0]+(255-c[0])*t),Math.round(c[1]+(255-c[1])*t),Math.round(c[2]+(255-c[2])*t)]; }
function darken(c,t){ return [Math.round(c[0]*(1-t)),Math.round(c[1]*(1-t)),Math.round(c[2]*(1-t))]; }
function rgb(c){ return 'rgb('+c[0]+','+c[1]+','+c[2]+')'; }
function rgba(c,a){ return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')'; }

/** 一の位ブロック1個の色。idx は下から数えた通し番号 */
function oneCellColor(digit, idx){
  if(digit===7) return RAINBOW[(6-idx)%7];        // 一の位が7 → にじいろ（上が紫、下が赤）
  if(digit===9) return GRAY3[Math.floor(idx/3)%3]; // 一の位が9 → 3階調のグレー
  return DIGIT_COLORS[digit] || [150,150,150];
}

/** 十の位のかたまり(10個)の「淡色 + 濃く明るいフチ」を返す。
    gi は何個目のかたまりか（7=にじいろ / 9=3階調 のため） */
function tensStyle(tensDigit, gi){
  // 例外：10のかたまりが1つだけ（10〜19）は 白 + 赤フチ
  if(tensDigit===1) return { fill:[255,255,255], border:DIGIT_COLORS[1] };
  if(tensDigit===7){ const c=RAINBOW[gi%7]; return { fill:mixWhite(c,0.66), border:c }; }
  if(tensDigit===9){ const c=GRAY3[gi%3];   return { fill:mixWhite(c,0.55), border:darken(c,0.15) }; }
  const c = DIGIT_COLORS[tensDigit];
  return { fill:mixWhite(c,0.66), border:c };
}

/**
 * Step Squad（三角数）のマスクの色。
 * 公式ルール：マスクの色は「その三角数が何番目か（＝段数 k）」と
 * 同じ数のナンバーブロックの色になる。
 *   k=5 ネイビー(5シアンの濃い版) / 6 藍 / 7 にじいろ / 8 マゼンタ / 9 灰
 *   k=10 白+赤フチ / 11 白+赤フチ+赤 / 12 +橙 / 13 +黄
 */
function maskStyle(k){
  if(k>=10){
    // 10以上は「10のかたまり＝白+赤フチ」＋一の位の色のアクセント
    const ones = k % 10;
    return { fill:[255,255,255], border:DIGIT_COLORS[1], rainbow:false,
             accent: ones>0 ? DIGIT_COLORS[ones] : null };
  }
  if(k===7) return { fill:null, border:darken(RAINBOW[0],0.35), rainbow:true, accent:null };
  // 15（5番目）は公式に「navy blue」と明記されているので、シアンの濃い版＝紺にする
  if(k===5) return { fill:[24,38,102], border:DIGIT_COLORS[5], rainbow:false, accent:null };
  const c = DIGIT_COLORS[k] || [120,120,130];
  // マスクなので同系色の濃い版にする（5 → ネイビー）
  return { fill:darken(c,0.45), border:c, rainbow:false, accent:null };
}

/* ── 数の性質 ──────────────────────────────────────────────────── */
function divisorsOf(n){ const d=[]; for(let i=1;i<=n;i++) if(n%i===0) d.push(i); return d; }
/** 三角数なら段数 k（n = k(k+1)/2）、違えば 0 */
function triStepOf(n){ const k=Math.round((Math.sqrt(8*n+1)-1)/2); return (k*(k+1)/2===n)?k:0; }
function isSquareNum(n){ const s=Math.round(Math.sqrt(n)); return s*s===n; }

function numProps(n){
  const ds = divisorsOf(n);
  const k  = triStepOf(n);
  return {
    n:n,
    tens: Math.floor(n/10) % 10,      // 十の位の数字（100 は 0 だが 100 は別扱い）
    ones: n % 10,                     // 一の位の数字
    hundreds: Math.floor(n/100),
    divisors: ds,
    divisorCount: ds.length,
    isSquare: isSquareNum(n),
    triangularStep: k,
    isTriangular: k>0,
    isPrime: ds.length===2,
    isSuperRect: ds.length>=6,        // 約数6個以上 = スーパー長方形
    isMultipleOf11: (n%11===0 && n>=11)
  };
}

/* ── ③ 顔は数の性質で決まる ────────────────────────────────────
   優先順位：単眼 > 平方数の四角い目 > スーパー長方形の長方形の目 > 丸い目
   マスク・左右非対称はその上に重ねて適用                          */
function faceSpec(n, p){
  const mono = (n===1 || n===100);            // "One" で始まる名前 → 単眼
  let eyeShape = 'round';
  // 1 は数学的には平方数だが、公式の「四角い目」は 4 以上（4,9,16,…,100）
  if(p.isSquare && n>=4)  eyeShape = 'square';
  else if(p.isSuperRect)  eyeShape = 'rectTall';  // スーパー長方形は縦長長方形の目
  if(n===7)                eyeShape = 'rectWide'; // 7：横幅約2倍の角丸長方形の目

  return {
    eyeCount   : mono ? 1 : 2,
    eyeShape   : eyeShape,
    // 11の倍数（55を除く）は左右で大きさの違う目。大きい方＝画面左＝十の位
    asymmetric : (p.isMultipleOf11 && n!==55),
    // 三角数15以上はマスク。値はその三角数の段数
    mask       : (p.isTriangular && n>=15) ? p.triangularStep : 0,
    // スーパー長方形は腕にアレイ表示。ただし 44 と 64 は無し
    glasses    : (n===20),        // 20：紫の角丸メガネ
    // 2：白目を紫のフレームが囲む。目もフレームも「縦長の楕円」（参照画像）
    roundGlasses: (n===2) ? PURPLE : null,
    // 目の縦横比。1より大きいと縦長になる
    eyeAspect  : (n===2) ? 1.14 : 1,
    bowtie     : (n===20),        // 白い蝶ネクタイ
    tophat     : (n===20),        // 橙と紫のシルクハット
    // 26 は「エージェント」設定。黒い中折れ帽・黒いサングラス・黒いネクタイ
    fedora     : (n===26),
    sunglasses : (n===26),
    necktie    : (n===26),
    // 5 は「右目が星型」。原文 "her right eye is star-shaped" はキャラ基準なので
    // 見る側から見て「左」の目が星になる
    // 5 は「片目が星型」ではなく、両目をまとめて覆う濃紺の星のマスク（参照画像）
    starMask   : (n===5),
    // 10：目そのものは丸いまま、両目の後ろに赤い星の柄（アイコンとして目を星形にはしない）
    starBehindEyes: (n===10),
    // 指があるのは 5 と 10 だけ。5 は片手（キャラの左手＝見る側の右手）に
    // 濃紺の手袋1つで指5本。10 は両手に白い手袋で片手5本＝計10本
    // 5 の手袋色：腕(NAVY)より明るく、体(シアン)より暗い中間色
    gloves     : (n===5)  ? { side:'right', rgb:mixWhite(NAVY,0.35), fingers:5, star:true }
               : (n===10) ? { side:'both',  rgb:[255,255,255], fingers:5 }
               : null,
    jesterHat  : (n===3),         // 3 のジェスター帽（赤い三角＋黄色い玉・3つの尖り）
    buttons    : (n===3) ? 3 : 0, // 3 の中央ブロックのジャグリングボール3個
    hair       : (n===7) ? 7 : 0, // 7 の7本の虹色の髪（偶数番目が長い）
    infinityMask: (n===8),        // 8 の∞型マスク（濃紫・トゲ8本＝片側4本）
    tentacles  : (n===8) ? 8 : 0, // 8 はタコ状の手足8本（腕6・脚2）
    faceLow    : (n===20),        // 20 は10の倍数で唯一、顔が下寄り
    redLid     : (n===11),        // 11 は赤いまぶた
    irisRGB    : (n===16) ? DIGIT_COLORS[6] : null,  // 16 は紫の目
    // くちびるの色（1〜5 は原文どおり）
    lipRGB     : (n===1)   ? MAROON               // 1：マルーンの口
               : (n===2)   ? [255,120,170]        // 2：ピンクのくちびる
               : (n===3)   ? DIGIT_COLORS[1]      // 3：赤いくちびる
               : (n===4)   ? DARK_GREEN           // 4：濃緑のくちびる
               : (n===5)   ? DIGIT_COLORS[1]      // 5：赤いくちびる（参照画像）
               : (n===6)   ? [232,110,150]        // 6：ピンクのくちびる（公式）
               : (n===7)   ? DIGIT_COLORS[3]      // 7：黄色いくちびる
               : (n===10)  ? [255,120,170]
               : (n===55)  ? [110,25,35]
               : (n===100) ? DIGIT_COLORS[1]
               :             [205,86,104],
    // 目のふち（1〜5 は原文どおり。2 は「メガネのように見える紫の楕円」）
    eyeRimRGB  : (n===1) ? MAROON
               : (n===2) ? PURPLE
               : (n===3) ? DIGIT_COLORS[2]
               : (n===4) ? DARK_GREEN
               : (n===5) ? NAVY
               : (n===6) ? SIX_EYE_RIM             // 6：赤紫
               : (n===7) ? DIGIT_COLORS[3]         // 7：黄色
               : null,
    // まつげ（6：両目に3本ずつ、赤紫）
    lashes     : (n===6) ? 3 : 0,
    lashRGB    : (n===6) ? SIX_EYE_RIM : null,
    // 上の歯の本数。4 は原文に "four curved top teeth"
    teeth      : (n===4) ? 4 : 3,
    // ── 1 で確定した仕上げ。1〜6 に適用（7以降は未レビューなので従来のまま）──
    // ブロックのシルエットに輪郭線を描かない（塗りだけ）。
    // ※ 10以上は「白＋赤フチ」等をこのストロークで表現しているので残す
    blockOutline: (n>7),
    // 腕の付け根の高さ（そのブロックの上端からの割合）。側面の上のほうから生やす
    armAnchor  : (n<=5) ? 0.60 : ((n===6||n===7) ? 0.30 : 0.92),
    // 口は左右対称ではない。参照画像に合わせて「見る側の右の口角が上がる」向き
    mouthTilt  : (n<=7) ? 10 : 0,
    // 歯の描き方。'bands'＝上は白い帯・下は楕円（縦の区切り線なし）を既定にする
    teethStyle : 'bands',
    // 眉：形（rect/line/zigzag）・角度（flat/drooping/rising）・色をまとめた既定値。
    // null＝そのキャラは眉なし（「調整」パネルから個別に足せる）。
    // 4：頭のてっぺんに乗った濃緑の角材、外側が下がるタレ眉
    // 9：目と同色の、長い角丸長方形の眉（水平・公式）
    eyebrows   : (n===4)  ? { shape:'rect', tilt:'drooping', rgb:DARK_GREEN }
               : (n===9)  ? { shape:'line', tilt:'flat',     rgb:BLUEISH_GREY }
               // 26（エージェント）：サングラスの上に乗る紫の角材の眉
               : (n===26) ? { shape:'rect', tilt:'rising',   rgb:mixWhite(DIGIT_COLORS[6], 0.22) }
               : null,
    // 2 は白いソックス＋橙のキラキラしたダンスシューズを常時着用
    shoes      : (n===2) ? { sock:[255,255,255], shoe:DIGIT_COLORS[2], sparkle:true } : null,
    // 手足の色。1 と 3 はグラデーション（赤→マルーン／赤→紫）
    limbRGB    : (n===2)   ? PURPLE                       // 2：紫の手足
               : (n===4)   ? DARK_GREEN                   // 4：濃緑の手足
               : (n===5)   ? NAVY                         // 5：濃紺の腕と脚
               : (n===7)   ? DIGIT_COLORS[6]              // 7：6のボディに近い色（indigo）
               : (n===100) ? DIGIT_COLORS[1]              // 100 は 1 と同じ赤
               : (n===55)  ? darken(DIGIT_COLORS[5],0.55) // 55 はネイビー
               :             null,
    limbGrad   : (n===1) ? [DIGIT_COLORS[1], MAROON]      // 1：赤→マルーン
               // 3：参照画像では手足は赤系。付け根をやや暗い赤にして体から分ける
               : (n===3) ? [darken(DIGIT_COLORS[1],0.22), DIGIT_COLORS[1]]
               : (n===6) ? [SIX_LIMB_A, SIX_LIMB_B]        // 6：赤みでまとめたグラデーション
               : null
  };
}

/**
 * セル列を「連結した10個のかたまり」×t ＋ 残り に並べ替える。
 * 種は残りのうち一番上・一番左。そこから4近傍で上→左優先に育てるので、
 * かたまりは必ずひとつながりになる（フチを外周に描くための前提）。
 */
function carveConnectedTens(order, t, mode){
  // 育て方の好みを何通りか試し、「全部10個ちょうど＆ひとつながり」に
  // なった並びを採用する（貪欲法だけだと取り残しが出るため）。
  // mode で「十のかたまりをどこから育てるか」＝一の位がどこに残るかを決める：
  //   'top'(既定) 上から育てる → 一の位は下に残る（25の下段シアン, 36の下段藍）
  //   'bottom'    下から育てる → 一の位は上に残る（14の上のライム）
  //   'col'       左の列から育てる → 十のかたまりが縦1列になる（40の「縦に立つ」）
  const P_TOP  = function(c){ return [c.gy, c.gx]; };
  const P_BOT  = function(c){ return [-c.gy, c.gx]; };
  const P_COL  = function(c){ return [c.gx, c.gy]; };
  const P_RCOL = function(c){ return [-c.gx, c.gy]; };
  const prefs = (mode==='bottom') ? [P_BOT, P_COL, P_TOP, P_RCOL]
              : (mode==='col')    ? [P_COL, P_TOP, P_BOT, P_RCOL]
              :                     [P_TOP, P_COL, P_BOT, P_RCOL];
  let fallback = null;
  for(const pref of prefs){
    const res = carveOnce(order, t, pref);
    if(res.valid) return res.out;
    if(!fallback) fallback = res.out;
  }
  return fallback;
}

function carveOnce(order, t, pref){
  const key = c => c.gx+','+c.gy;
  const remain = new Map(order.map(c => [key(c), c]));

  // remain から exclude を除いたときの「連結成分の数」。
  // これが増える手＝残りを分断する手なので避ける
  function fragments(exclude){
    const seen = new Set(); let comps = 0;
    for(const k0 of remain.keys()){
      if(k0===exclude || seen.has(k0)) continue;
      comps++; seen.add(k0);
      const stack = [k0];
      while(stack.length){
        const p = stack.pop().split(','), gx = +p[0], gy = +p[1];
        const nb = [(gx+1)+','+gy, (gx-1)+','+gy, gx+','+(gy+1), gx+','+(gy-1)];
        for(const q of nb){
          if(q!==exclude && remain.has(q) && !seen.has(q)){ seen.add(q); stack.push(q); }
        }
      }
    }
    return comps;
  }

  // スコアの辞書式比較（小さいほうが良い）
  function less(a,b){
    for(let i=0;i<a.length;i++){ if(a[i]!==b[i]) return a[i]<b[i]; }
    return false;
  }

  const out = [];
  let valid = true;
  for(let g=0; g<t; g++){
    // 種：残りのうち pref がいちばん小さいもの
    let seed = null, seedScore = null;
    for(const c of remain.values()){
      const sc = pref(c);
      if(!seedScore || less(sc, seedScore)){ seed = c; seedScore = sc; }
    }
    if(!seed){ valid = false; break; }
    const grp = [seed]; remain.delete(key(seed));
    const inGrp = new Set([key(seed)]);
    while(grp.length < 10){
      let best = null, bestScore = null;
      for(const c of remain.values()){
        if(!( inGrp.has((c.gx+1)+','+c.gy) || inGrp.has((c.gx-1)+','+c.gy)
           || inGrp.has(c.gx+','+(c.gy+1)) || inGrp.has(c.gx+','+(c.gy-1)) )) continue;
        // ①残りを分断しない手を優先 ②pref の順
        const sc = [fragments(key(c))].concat(pref(c));
        if(!bestScore || less(sc, bestScore)){ best = c; bestScore = sc; }
      }
      if(!best) break;
      grp.push(best); inGrp.add(key(best)); remain.delete(key(best));
    }
    if(grp.length !== 10) valid = false;   // 10個そろわなかった＝この育て方は失敗
    for(const c of grp) out.push(c);
  }
  // 残り＝一の位ブロック。元の順（上→左）を保つ
  for(const c of order) if(remain.has(key(c))) out.push(c);
  return { out:out, valid:valid };
}

/**
 * character-data.json の mainBlockShape（Fandom Wiki 原文）から起こした公式の外形。
 * c=横のマス数, r=縦のマス数, carve=十のかたまりをどこから育てるか
 *   'top'    十が上 → 一の位が下に残る（25「シアン5個（下段）」36「藍6個（下段）」）
 *   'bottom' 十が下 → 一の位が上に残る（14「緑4個が ten-block の上」）
 *   'col'    十が縦1列（40「緑の ten-block 4本が縦に立つ」＝10の倍数）
 * 表にない数は従来どおりの一般則（十の位ぶんの縦列＋右に端数）で並べる。
 */
/* character-data.json の mainBlockShape 原文（単体HTMLなので表として持つ）。
   記法：A×B＝長方形 / nR・nL＝n個を右・左に連結 / nC・(A×B)C＝上に横中央で載せる
        + は左から順に横へ連結 / 1R+2R+3R+… は階段 / sometimes 以降は無視     */
const MAIN_SHAPE = {
  1:'1×1', 2:'1×2', 3:'1×3', 4:'2×2', 5:'1×5', 6:'2×3',
  7:'1×7', 8:'2×4', 9:'3×3', 10:'1×10', 11:'1R+2×5', 12:'3×4',
  13:'2R+3+(2×4)L', 14:'2×7', 15:'1R+2R+3R+4R+5', 16:'4×4', 17:'1R+4+(3×2)L+(2×3)C', 18:'3×6',
  19:'1L+2×9', 20:'2×10', 21:'3×7', 22:'2C+4×5', 23:'(2x7)L+3×3', 24:'3×8',
  25:'5×5', 26:'2C+4×6', 27:'3×9', 28:'4x7', 29:'2L+3×9', 30:'3×10',
  31:'7×4+3L', 32:'4×8', 33:'3x11', 34:'(2x2)C+6x5', 35:'5×7', 36:'6×6',
  40:'4×10', 45:'1R+2R+3R+4R+5R+6R+7R+8R+9', 50:'5×10', 60:'6×10', 63:'7×9',
  64:'8×8', 70:'7×10', 72:'6x12', 80:'8×10', 81:'9×9', 90:'9×10', 100:'10×10'
};
/* 十のかたまりをどこから切り出すか＝一の位がどこに残るか。
   json の blocks.description で「上」と書かれている数だけ bottom にする      */
const CARVE_MODE = {
  // 9・11〜22 は陽太さんの「かたち編集」で確定した値（shape-overrides.json より焼き込み）
  9:'top', 11:'bottom', 12:'col', 13:'col', 14:'bottom', 15:'col', 17:'bottom',
  18:'col', 19:'col', 21:'bottom', 22:'col', 26:'bottom', 34:'bottom',
  20:'col', 30:'col', 40:'col', 50:'col', 60:'col', 70:'col', 80:'col', 90:'col', 10:'col'
};
/* 「かたち編集」で確定させた並び（陽太さんの承認を経てここに焼き込む）。
   値は [{gx,gy}, ...]（n個ちょうど）。空なら MAIN_SHAPE 等の既存ロジックのまま。
   12・13・15・17〜19・21・22 は shape-overrides.json（陽太さんの手動編集）より。 */
function xy(pairs){ return pairs.map(p => ({gx:p[0], gy:p[1]})); }
const CUSTOM_SHAPE = {
  12: xy([[1,1],[1,2],[2,2],[2,3],[2,4],[2,5],[1,5],[2,1],[1,4],[3,4],[1,3],[3,5]]),
  13: xy([[1,5],[2,5],[3,5],[2,1],[1,4],[2,4],[1,1],[3,4],[1,3],[3,3],[1,2],[2,2],[2,3]]),
  15: xy([[5,1],[5,2],[4,2],[5,3],[4,3],[3,3],[5,4],[2,4],[3,4],[4,4],[1,5],[2,5],[3,5],[4,5],[5,5]]),
  17: xy([[2,5],[2,6],[3,7],[3,4],[2,4],[3,6],[4,1],[2,7],[3,5],[4,2],[1,2],[1,4],[2,2],[3,2],[2,3],[3,3],[1,3]]),
  18: xy([[1,4],[1,5],[1,3],[1,6],[1,2],[1,7],[2,4],[1,8],[1,1],[1,9],[2,5],[2,6],[2,7],[2,8],[2,9],[2,10],[2,3],[1,10]]),
  19: xy([[1,2],[2,2],[1,3],[2,3],[1,4],[2,4],[1,5],[2,5],[1,6],[2,6],[1,1],[1,7],[2,7],[1,8],[2,8],[1,9],[2,9],[1,10],[2,10]]),
  21: xy([[6,5],[6,4],[6,6],[6,3],[6,2],[4,4],[6,1],[3,4],[5,2],[2,6],[4,3],[5,3],[2,5],[1,6],[5,4],[3,5],[4,5],[5,5],[3,6],[4,6],[5,6]]),
  22: xy([[1,10],[2,10],[1,1],[2,2],[1,9],[2,9],[1,2],[2,1],[1,8],[2,8],[1,4],[2,3],[1,3],[2,7],[1,7],[2,4],[1,6],[1,5],[2,5],[2,6],[3,9],[3,10]])
  // ※ これ以降にキャラメイクで作った配置を書き足さないこと。
  //    overrides.js（自動生成）側に入り、この表より優先される。
};
/* かたち編集パネルでその場に調整中の値（localStorage 保存、まだソースに焼き込んでいない）。
   CUSTOM_SHAPE より弱く、両方あれば CUSTOM_SHAPE を優先する。 */
let SHAPE_OVERRIDE_USER = {};
/* 「10個のかたまりがどこから育つか」の上書き（かたち編集パネルの起点セレクトから）。
   CARVE_MODE（焼き込み済み）より強い。null/未設定なら CARVE_MODE[n]、それも無ければ 'top'。 */
let CARVE_MODE_USER = {};
/* ── 陽太さんがキャラメイクで確定させた上書き（overrides.js）──
   自動生成ファイルを読むだけなので、エンジン側の「原作のデザインルール」と
   混ざらない。優先順位は
     エンジン既定 < overrides.js < localStorage（編集中の作業コピー）
   overrides ファイルが無くても（読み込み忘れ・単体テスト）動くようにする。 */
function nbOverrides(){
  return (typeof window !== 'undefined' && window.NB_OVERRIDES) ? window.NB_OVERRIDES : {};
}
function overrideFaceGeom(n){ const o = nbOverrides().faceGeom;  return o ? o[n] : null; }
function overrideCarveMode(n){ const o = nbOverrides().carveMode; return o ? o[n] : null; }
function overrideShape(n){
  const o = nbOverrides().shapes; const v = o ? o[n] : null;
  return v ? v.map(p => ({gx:p[0], gy:p[1]})) : null;   // [[gx,gy]] → [{gx,gy}]
}
function overrideGroupOnes(n){
  const o = nbOverrides().groupOnes; const v = o ? o[n] : null;
  return v ? { ones:v } : null;
}

function getCarveMode(n){ return CARVE_MODE_USER[n] || overrideCarveMode(n) || CARVE_MODE[n] || 'top'; }
/* 「どのマスが一の位（バラの個別色）か」を明示的に上書きする。
   公式画像と自動判定（連結ぶんどり）がズレたときのための最終手段。
   値は { ones:[[gx,gy],...] }。ones の並び順がそのまま虹色/灰色の階調順になる。
   ones に入らなかったマスは、そのぶんを carveConnectedTens で十のかたまりに分ける
   （十のかたまりが複数あるケースでも、位置の割り振りは自動のまま）。
   GROUP_OVERRIDE は焼き込み済み（CUSTOM_SHAPE / CARVE_MODE と同格）。
   GROUP_OVERRIDE_USER（localStorage）はその場の作業コピーで、消えても
   困らないよう、確定したものはここへ焼き込んで永続化する。              */
// 陽太さんの色分け指定は overrides.js 側（この表より優先される）
const GROUP_OVERRIDE = {};
let GROUP_OVERRIDE_USER = {};
// 調整パネルで上書きされた値（localStorage に保存）。
// 下の nbLoadUserEdits() から代入するので、宣言はそれより前に置くこと。
let FACE_GEOM_USER = {};

/* ── 編集中の作業コピー（localStorage）の共有 ───────────────────────
   zukan.html（キャラメイク）と index.html（ゲーム）は同じフォルダの
   file:// なので、ブラウザから見て同じ保存領域を共有できる。
   ここで読み込みを共通化しておくことで、ゲーム側も「まだ書き出していない
   編集中の見た目」をそのまま表示できる。
   さらに storage イベント（別のタブ・ウィンドウでの変更通知）を拾うので、
   図鑑で調整した内容がゲーム側にその場で反映される。            */
const NB_KEYS = {
  'nbg.faceGeom.v1'      : v => { FACE_GEOM_USER      = v; },
  'nbg.shapeOverride.v1' : v => { SHAPE_OVERRIDE_USER = v; },
  'nbg.carveMode.v1'     : v => { CARVE_MODE_USER     = v; },
  'nbg.groupOverride.v1' : v => { GROUP_OVERRIDE_USER = v; }
};
function nbLoadUserEdits(){
  for(const key in NB_KEYS){
    let v = {};
    try{ const raw = localStorage.getItem(key); v = raw ? JSON.parse(raw) : {}; }catch(e){ v = {}; }
    NB_KEYS[key](v);
  }
}
/** 編集内容が変わったときに呼びたい処理（各アプリが登録する）。
 *  かたちが変われば描画サイズも変わるので、受け取った側で作り直す。 */
const nbChangeListeners = [];
function onNumberblocksChanged(fn){ nbChangeListeners.push(fn); }
function nbNotifyChanged(){
  for(let n=1;n<=100;n++) invalidateSpec(n);
  for(const fn of nbChangeListeners){ try{ fn(); }catch(e){} }
}
if(typeof window !== 'undefined'){
  nbLoadUserEdits();
  // 他のタブ・ウィンドウ（＝キャラメイク側）での保存を検知して即座に反映する
  window.addEventListener('storage', function(ev){
    if(ev.key !== null && !(ev.key in NB_KEYS)) return;   // 関係ないキーは無視
    nbLoadUserEdits();
    nbNotifyChanged();
  });
}
/* 階段で並べる数。15・45 は MAIN_SHAPE が階段そのもの、55 は
   「sometimes 1R+2R+…+9R+10」＝10×10 で収まる。
   66・78・91 の階段は 11×11〜13×13 になり「1マス固定」の前提（最大10×10）を
   壊すので、一般則（十の位ぶんの縦列＋端数）で並べる。マスクは付く。   */
const STAIR_NUMS = { 55:1 };

/** mainBlockShape の記法を解釈して外形（cols/rows/cells）を返す。解釈できなければ null */
function parseMainBlockShape(str){
  if(!str) return null;
  const s = String(str).split(/,?\s*sometimes/i)[0].trim();
  const terms = s.split('+').map(function(t){ return t.trim(); }).filter(Boolean);
  if(!terms.length) return null;

  // 階段：1R+2R+3R+… のように 1,2,3,… が並ぶ形
  const bares = terms.map(function(t){ return t.match(/^(\d+)\s*[LRC]?$/); });
  if(terms.length>=3 && bares.every(function(m){ return !!m; })
     && bares.every(function(m,i){ return +m[1]===i+1; })){
    const k = terms.length, cells = [];
    for(let gy=0; gy<k; gy++) for(let gx=0; gx<=gy; gx++) cells.push({gx:gx, gy:gy});
    return { cols:k, rows:k, cells:cells };
  }

  // 各項を {w,h,place} に。place: L=左 / R=右 / C=上に載せる / ''=本体
  const parsed = [];
  for(const t of terms){
    let m = t.match(/^\(\s*(\d+)\s*[×x]\s*(\d+)\s*\)\s*([LRC])?$/)
         || t.match(/^(\d+)\s*[×x]\s*(\d+)\s*([LRC])?$/);
    if(m){ parsed.push({ w:+m[1], h:+m[2], place:m[3]||'' }); continue; }
    m = t.match(/^(\d+)\s*([LRC])?$/);
    if(m){ parsed.push({ w:1, h:+m[1], place:m[2]||'' }); continue; }
    return null;   // 解釈できない記法（28 の [>] など）
  }

  const byPlace = function(p){ return parsed.filter(function(q){ return q.place===p; }); };
  const row  = byPlace('L').concat(byPlace(''), byPlace('R'));
  const tops = byPlace('C');
  if(!row.length) return null;

  const baseW = row.reduce(function(a,p){ return a+p.w; }, 0);
  const baseH = row.reduce(function(a,p){ return Math.max(a,p.h); }, 0);
  const topW  = tops.reduce(function(a,p){ return a+p.w; }, 0);
  const topH  = tops.reduce(function(a,p){ return Math.max(a,p.h); }, 0);
  const cols = Math.max(baseW, topW), rows = baseH + topH;

  const cells = [];
  let tx = Math.floor((cols - topW)/2);          // 上に載る項は横方向中央
  for(const p of tops){
    for(let gy=0; gy<p.h; gy++) for(let gx=0; gx<p.w; gx++)
      cells.push({ gx:tx+gx, gy:topH-p.h+gy });
    tx += p.w;
  }
  let bx = Math.floor((cols - baseW)/2);         // 下の並びは左から順・下揃え
  for(const p of row){
    for(let gy=0; gy<p.h; gy++) for(let gx=0; gx<p.w; gx++)
      cells.push({ gx:bx+gx, gy:rows-p.h+gy });
    bx += p.w;
  }
  return { cols:cols, rows:rows, cells:cells };
}

/* ── ⑥ 標準の並び ────────────────────────────────────────────────
   order の先頭から 10個ずつが「十のかたまり」、残りが一の位ブロック  */
/** 一の位の手動上書き（GROUP_OVERRIDE_USER）を、既存ロジックの結果に後がけする。
 * raw.order は「なんらかの順で並んだ n 個のセル」であればよい
 *（すでに十/一に分かれているかどうかは問わない＝ここで作り直す）。 */
/** セル配列の外接矩形の左上を (0,0) にそろえる（編集グリッドの余白オフセットを消す） */
function normalizeCells(list){
  let minX=Infinity,minY=Infinity;
  for(const c of list){ if(c.gx<minX)minX=c.gx; if(c.gy<minY)minY=c.gy; }
  if(minX===Infinity) return list.slice();
  return list.map(c => ({gx:c.gx-minX, gy:c.gy-minY}));
}
function applyGroupOverride(n, raw){
  const gov = GROUP_OVERRIDE_USER[n] || overrideGroupOnes(n) || GROUP_OVERRIDE[n];
  if(!gov || !gov.ones || raw.mode !== 'normal') return raw;
  const tens = Math.floor(n/10), onesDigit = n % 10;
  const key = c => c.gx+','+c.gy;
  // gov.ones は保存時点で「編集グリッド全体の外接矩形」基準に正規化済み。
  // raw 側も同じ基準（外接矩形の左上=0,0）にそろえてから照合する。
  // 同じマスが重複して記録されている壊れたデータでも数がズレて破綻しないよう、
  // 重複を取り除いた「実際にユニークなマス数」で判定する。
  const onesCellsRaw = gov.ones.map(c => ({gx:c[0], gy:c[1]}));
  const onesCells = Array.from(new Map(onesCellsRaw.map(c => [key(c), c])).values());
  if(onesCells.length !== onesDigit) return raw;     // 数が合わない上書きは無視（重複除去後で判定）
  const allCells = normalizeCells(raw.order.map(c => ({gx:c.gx, gy:c.gy})));
  const oneKeys = new Set(onesCells.map(key));
  for(const k of oneKeys) if(!allCells.some(c => key(c)===k)) return raw;  // 実在しないマスを含む上書きは無視
  const pool = allCells.filter(c => !oneKeys.has(key(c)));
  const tenOrder = tens>0 ? carveConnectedTens(pool, tens, getCarveMode(n)) : [];
  return { cols:raw.cols, rows:raw.rows, mode:raw.mode, order: tenOrder.concat(onesCells) };
}

function layoutCells(n){
  return applyGroupOverride(n, layoutCellsRaw(n));
}

function layoutCellsRaw(n){
  const tens = Math.floor(n/10), ones = n%10;
  const order = [];
  const push = (gx,gy)=>order.push({gx:gx,gy:gy});

  // 「かたち編集」で保存したシルエットがあれば最優先で使う。
  // セルの集合（gx,gy）だけ与え、十のかたまりの連結・色分けは
  // 既存の carveConnectedTens に任せる（並び替え編集では色は決めない）。
  const custom = SHAPE_OVERRIDE_USER[n] || overrideShape(n) || CUSTOM_SHAPE[n];
  if(custom && custom.length === n){
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const c of custom){ if(c.gx<minX)minX=c.gx; if(c.gx>maxX)maxX=c.gx; if(c.gy<minY)minY=c.gy; if(c.gy>maxY)maxY=c.gy; }
    const norm = custom.map(c => ({gx:c.gx-minX, gy:c.gy-minY}));
    return { cols:maxX-minX+1, rows:maxY-minY+1,
             order:carveConnectedTens(norm, tens, getCarveMode(n)), mode:'normal' };
  }

  // 100：10×10の市松
  if(n===100){
    for(let gy=0; gy<10; gy++) for(let gx=0; gx<10; gx++) push(gx,gy);
    return { cols:10, rows:10, order:order, mode:'hundred' };
  }

  // 12：3×4の長方形。橙2個が中央、10ブロックが周りを囲む
  if(n===12){
    push(0,0); push(1,0); push(2,0);      // 上辺
    push(2,1); push(2,2);                 // 右辺
    push(2,3); push(1,3); push(0,3);      // 下辺
    push(0,2); push(0,1);                 // 左辺  → 計10（外周）
    push(1,1); push(1,2);                 // 中央2個（一の位＝橙）
    return { cols:3, rows:4, order:order, mode:'normal' };
  }

  // 16：4×4の正方形。藍6個が帽子の形で上、10ブロックがその下に収まる
  if(n===16){
    for(let gx=0; gx<4; gx++) push(gx,3);   // 最下段4
    for(let gx=0; gx<4; gx++) push(gx,2);   // その上4
    push(0,1); push(3,1);                   // カップの縁2 → 計10
    push(1,1); push(2,1);                   // 帽子の胴2
    for(let gx=0; gx<4; gx++) push(gx,0);   // 帽子のつば4 → 計6
    return { cols:4, rows:4, order:order, mode:'normal' };
  }

  // 6：1×6の縦一列。各ブロックにサイコロの目を薄く重ねる（下から1..6）
  if(n===6){
    for(let gy=0; gy<6; gy++) push(0,gy);
    return { cols:1, rows:6, order:order, mode:'normal' };
  }

  // 18：3×6。白＋赤枠の 2×5 を左上に置き、マゼンタ8個が右側と下側を包む
  if(n===18){
    for(let gy=0; gy<5; gy++){ push(0,gy); push(1,gy); }   // ten（2×5）＝10
    for(let gy=0; gy<6; gy++) push(2,gy);                  // 右側6
    push(0,5); push(1,5);                                  // 下側2 → 計8
    return { cols:3, rows:6, order:order, mode:'normal' };
  }

  // Step Squad の階段（1+2+3+…+k）
  const kStep = triStepOf(n);
  if(STAIR_NUMS[n] && kStep>=5){
    for(let gy=0; gy<kStep; gy++) for(let gx=0; gx<=gy; gx++) push(gx,gy);
    // 単純に上から10個ずつ切ると、大きい階段（66,78,91）でかたまりが分断され、
    // 「外周にフチ」が描けなくなる。連結を保ったまま10個ずつ切り出す。
    return { cols:kStep, rows:kStep, order:carveConnectedTens(order, tens, 'top'), mode:'normal' };
  }

  // 81：9×9。赤いブロック1個が「鼻」の役割をするので目と口のあいだに置く
  if(n===81){
    const noseX = 4, noseY = 2, body = [];
    for(let gy=0; gy<9; gy++) for(let gx=0; gx<9; gx++){
      if(gx===noseX && gy===noseY) continue;
      body.push({gx:gx, gy:gy});
    }
    const carved = carveConnectedTens(body, 8, 'top');
    carved.push({gx:noseX, gy:noseY});   // 最後＝一の位（赤）
    return { cols:9, rows:9, order:carved, mode:'normal' };
  }

  // 公式の外形（mainBlockShape 原文をパースしたもの）
  const sh = parseMainBlockShape(MAIN_SHAPE[n]);
  if(sh && sh.cells.length === n){
    return { cols:sh.cols, rows:sh.rows,
             order:carveConnectedTens(sh.cells, tens, getCarveMode(n)),
             mode:'normal' };
  }

  // 平方数は必ず n×n（未調査の数のフォールバック。一の位は下に残す）
  const s = Math.round(Math.sqrt(n));
  if(s*s===n && n>=4){
    for(let gy=0; gy<s; gy++) for(let gx=0; gx<s; gx++) push(gx,gy);
    return { cols:s, rows:s, order:carveConnectedTens(order, tens, getCarveMode(n)), mode:'normal' };
  }

  // 11〜99の未調査分：十の位ぶんの縦列（10段）を並べ、右に端数の列を下から積む
  const cols = tens + (ones>0 ? 1 : 0);
  for(let g=0; g<tens; g++) for(let k=0;k<10;k++) push(g, 9-k);
  for(let k=0;k<ones;k++) push(tens, 9-k);
  return { cols:cols, rows:10, order:order, mode:'normal' };
}

/**
 * 数 n の設計データを返す純粋関数。
 * cells[i] = {gx,gy,group,colorRGB,borderRGB,isTen,isHundred}
 * groups[j] = {kind:'ten'|'one'|'hundred', cellIndexes:[...], fillRGB, borderRGB}
 */
const _specCache = {};
const _maskClipCache = {};   // マスクのクリップ範囲（かたちが変われば作り直す）
/** かたち編集で SHAPE_OVERRIDE_USER を書き換えたときに呼ぶ（キャッシュを捨てて再計算させる） */
function invalidateSpec(n){ delete _specCache[n]; delete _maskClipCache[n]; }
function blockSpec(n){
  n = Math.max(1, Math.min(100, Math.round(n)));
  if(_specCache[n]) return _specCache[n];   // ずかんで100回描くのでキャッシュする
  const p = numProps(n);
  const L = layoutCells(n);
  const cells = [], groups = [];

  if(L.mode==='hundred'){
    // 100：市松模様 ＋ 暗いフチ（かたまりは1つ）
    const g = { kind:'hundred', cellIndexes:[], fillRGB:HUNDRED_A, borderRGB:HUNDRED_BORDER };
    L.order.forEach(function(c,i){
      const light = ((c.gx + c.gy) % 2 === 0);
      cells.push({ gx:c.gx, gy:c.gy, group:0,
                   colorRGB: light?HUNDRED_A:HUNDRED_B,
                   borderRGB: HUNDRED_BORDER, isTen:false, isHundred:true });
      g.cellIndexes.push(i);
    });
    groups.push(g);
  } else {
    const tens = Math.floor(n/10), onesDigit = n%10;
    // 十の位（10個ひとかたまり）
    for(let g=0; g<tens; g++){
      const st = tensStyle(tens, g);
      const grp = { kind:'ten', cellIndexes:[], fillRGB:st.fill, borderRGB:st.border };
      for(let k=0;k<10;k++){
        const c = L.order[g*10+k];
        grp.cellIndexes.push(cells.length);
        cells.push({ gx:c.gx, gy:c.gy, group:groups.length,
                     colorRGB:st.fill, borderRGB:st.border, isTen:true, isHundred:false });
      }
      groups.push(grp);
    }
    // 一の位（1個ずつが独立したブロック＝フチの単位）
    for(let j=0;j<onesDigit;j++){
      const c = L.order[tens*10+j];
      const col = oneCellColor(onesDigit, j);
      const bor = darken(col, 0.34);
      groups.push({ kind:'one', cellIndexes:[cells.length], fillRGB:col, borderRGB:bor });
      cells.push({ gx:c.gx, gy:c.gy, group:groups.length-1,
                   colorRGB:col, borderRGB:bor, isTen:false, isHundred:false });
    }
  }

  const spec = { n:n, cols:L.cols, rows:L.rows, cells:cells, groups:groups,
                 face:faceSpec(n,p), props:p };
  _specCache[n] = spec;
  return spec;
}

/* ── ナンバーリングの色（一の位の色。ゾロ目0なら十の位の色） ── */
function mainColorOf(n){
  if(n===100) return [214,175,60];
  const o = n%10, t = Math.floor(n/10);
  if(o>0) return oneCellColor(o, 0);
  return tensStyle(t,0).border;
}

/* ===================== 描画パート ===================== */

/* ── 線幅は全キャラ共通の固定値 ────────────────────────────────
   1マスの大きさ（CUBE）が全キャラ共通の定数になったので、そこから
   決まる STROKE も定数になる。キャラごとに太さが変わる箇所を作らないこと。 */
let STROKE = 2;
function setStroke(bs){ STROKE = Math.max(1, bs*0.075); }

/** セル集合の外周（＋穴の内周）を線分列で返す。1マスごとには囲まない */
function groupOutline(cells, idxs){
  const set = Object.create(null);
  for(const i of idxs) set[cells[i].gx+','+cells[i].gy] = true;
  const segs = [];
  for(const i of idxs){
    const gx=cells[i].gx, gy=cells[i].gy;
    if(!set[gx+','+(gy-1)]) segs.push([gx,gy,   gx+1,gy  ]); // 上
    if(!set[gx+','+(gy+1)]) segs.push([gx,gy+1, gx+1,gy+1]); // 下
    if(!set[(gx-1)+','+gy]) segs.push([gx,gy,   gx,  gy+1]); // 左
    if(!set[(gx+1)+','+gy]) segs.push([gx+1,gy, gx+1,gy+1]); // 右
  }
  return segs;
}

/**
 * しずく型（オタマジャクシ型）の手足。
 * 付け根が細く、先端が丸くふくらんだ塊になる。輪郭線は付けない。
 *   w1 = 付け根の太さ / w2 = 先端のふくらみの直径
 */
function drawTaper(ctx, x1,y1, x2,y2, w1, w2, fill, stroke, lw){
  const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)||1;
  const nx=-dy/len, ny=dx/len;               // 法線
  const ang = Math.atan2(ny,nx);
  const a1x=x1+nx*w1/2, a1y=y1+ny*w1/2, b1x=x1-nx*w1/2, b1y=y1-ny*w1/2;
  const a2x=x2+nx*w2/2, a2y=y2+ny*w2/2;
  // 付け根から先端のふくらみへ、細→太へ単調に太らせる（途中で膨らませない）
  // 制御点を中ほどに寄せると、輪郭がふくらんで丸みのある形になる
  const cA = 0.52;
  ctx.beginPath();
  ctx.moveTo(a1x,a1y);
  ctx.quadraticCurveTo(x1+dx*cA + nx*w1*0.5, y1+dy*cA + ny*w1*0.5, a2x, a2y);
  ctx.arc(x2, y2, w2/2, ang, ang-Math.PI, true);   // 先端の丸い塊
  ctx.quadraticCurveTo(x1+dx*cA - nx*w1*0.5, y1+dy*cA - ny*w1*0.5, b1x, b1y);
  // 付け根も丸くする（直線で閉じると四角い切り口に見えてしまう）
  ctx.arc(x1, y1, w1/2, ang+Math.PI, ang, true);
  ctx.closePath();
  ctx.fillStyle=fill; ctx.fill();
  if(stroke){ ctx.lineWidth=lw; ctx.strokeStyle=stroke; ctx.lineJoin='round'; ctx.stroke(); }
}

/** 星型パス */
function starPath(ctx, cx, cy, rOut, rIn, points, rot){
  ctx.beginPath();
  for(let i=0;i<points*2;i++){
    const r = (i%2===0)? rOut : rIn;
    const a = rot + i*Math.PI/points;
    const px = cx + Math.cos(a)*r, py = cy + Math.sin(a)*r;
    if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.closePath();
}

/** 手足の座標を計算（顔・手袋・アレイ表示からも参照する） */
/* 手足の比率（1マスの1辺 W 基準・参照画像の実測値）
   長さ 0.48W／腕は水平から55°下向き／脚は垂直から10°の開き／先端の玉 0.19W */
const LIMB_LEN = 0.48;
const ARM_DX = Math.cos(55*Math.PI/180), ARM_DY = Math.sin(55*Math.PI/180);
const LEG_DX = Math.sin(10*Math.PI/180), LEG_DY = Math.cos(10*Math.PI/180);

function limbGeometry(spec, x, y, bs, t, animate){
  const w = spec.cols*bs, h = spec.rows*bs;
  const cells = spec.cells;
  // 指定グリッド位置に最も近いセルの色を拾う
  function nearest(tgx, tgy){
    let best=null, bd=Infinity;
    for(const c of cells){
      const d = Math.abs(c.gx-tgx)*1.0 + Math.abs(c.gy-tgy)*1.2;
      if(d<bd){ bd=d; best=c; }
    }
    return best || cells[0];
  }
  // 手足の寸法は「1マスの大きさ」だけで決める。キャラ全体の高さに比例させない
  // （原作では 1 も 100 も手足の太さ・長さはほぼ同じ）
  const swing = animate ? Math.sin(t*0.004)*bs*0.16 : 0;
  const armSw = animate ? Math.sin(t*0.004+Math.PI)*bs*0.13 : 0;

  const legY   = y + h;
  const legLen = bs*LIMB_LEN;
  const lx1 = x + w*0.5 - bs*0.22, lx2 = x + w*0.5 + bs*0.22;
  const legCellA = nearest((spec.cols-1)*0.28, spec.rows-1);
  const legCellB = nearest((spec.cols-1)*0.72, spec.rows-1);

  const armRowDefault = Math.round(spec.rows*0.34);
  const armRow = pick(getFaceGeom(spec.n).armRow, armRowDefault);
  const armGy = Math.min(spec.rows-1, Math.max(0, armRow));
  const armAnchor = pick(getFaceGeom(spec.n).armAnchor, spec.face.armAnchor);
  const armY  = y + (armGy+armAnchor)*bs;   // 付け根の高さはキャラごと
  const armLen= bs*LIMB_LEN;
  let armCellL=null, armCellR=null;
  for(const c of cells){
    if(c.gy===armGy){
      if(!armCellL || c.gx<armCellL.gx) armCellL=c;
      if(!armCellR || c.gx>armCellR.gx) armCellR=c;
    }
  }
  if(!armCellL){ armCellL = nearest(0, armGy); armCellR = nearest(spec.cols-1, armGy); }
  const alx = x + armCellL.gx*bs, arx = x + (armCellR.gx+1)*bs;

  const geo = {
    legs:[
      // 脚：垂直から約10°の開き
      { x1:lx1, y1:legY-bs*0.08, x2:lx1-legLen*LEG_DX+swing, y2:legY+legLen*LEG_DY, cell:legCellA },
      { x1:lx2, y1:legY-bs*0.08, x2:lx2+legLen*LEG_DX-swing, y2:legY+legLen*LEG_DY, cell:legCellB }
    ],
    arms:[
      // 腕：水平から約55°下向き（体の横に長く突き出さず、腹の下に短く生える）
      { x1:alx+bs*0.08, y1:armY, x2:alx-armLen*ARM_DX, y2:armY+armLen*ARM_DY+armSw, cell:armCellL },
      { x1:arx-bs*0.08, y1:armY, x2:arx+armLen*ARM_DX, y2:armY+armLen*ARM_DY-armSw, cell:armCellR }
    ]
  };

  // 8 はタコのように手足が8本（腕6・脚2）。左右に2本ずつ触手を足して計8本にする。
  // 追加ぶんは extraArms に入れ、手袋・アレイ表示は既定の arms[0]/[1] のまま扱う。
  if(spec.face.tentacles===8){
    geo.extraArms = [];
    for(let i=1;i<=2;i++){
      const gy = Math.min(spec.rows-1, armGy + i);
      let cl=null, cr=null;
      for(const c of cells){
        if(c.gy!==gy) continue;
        if(!cl || c.gx<cl.gx) cl=c;
        if(!cr || c.gx>cr.gx) cr=c;
      }
      if(!cl) continue;
      const ay = y + (gy+0.5)*bs;
      const lxx = x + cl.gx*bs, rxx = x + (cr.gx+1)*bs;
      const curl = armLen*(0.62 + i*0.12);
      geo.extraArms.push(
        { x1:lxx+bs*0.12, y1:ay, x2:lxx-curl*0.86, y2:ay+curl*0.42-armSw*0.6, cell:cl },
        { x1:rxx-bs*0.12, y1:ay, x2:rxx+curl*0.86, y2:ay+curl*0.42+armSw*0.6, cell:cr }
      );
    }
  }
  return geo;
}

function drawLimbs(ctx, spec, geo, bs){
  // 1マス基準：付け根は細く、先端のふくらみの直径＝セルの18%。輪郭線は付けない
  // 付け根を細くしすぎると棒に見える。少し太らせて涙型（付け根はやや太く、
  // そこから先端のふくらみへ向かって太くなる）にする。
  const w1 = bs*0.125, w2 = bs*0.20;
  const lw = STROKE*0.8;
  const f = spec.face;
  const G = getFaceGeom(spec.n);
  const over = pick(G.limbRGB, f.limbRGB);      // 手足の色を指定されているキャラ
  const grad = pick(G.limbGrad, f.limbGrad);    // 1＝赤→マルーン, 3＝赤→紫 のグラデーション
  const all = geo.legs.concat(geo.arms, geo.extraArms||[]);
  for(const L of all){
    let fill, bord;
    if(grad){
      // 付け根→先端でグラデーション
      // 付け根がブロックと同じ色だと体に溶けてしまうので、少し明度を落とす
      const g = ctx.createLinearGradient(L.x1, L.y1, L.x2, L.y2);
      g.addColorStop(0, rgb(darken(grad[0],0.18))); g.addColorStop(1, rgb(grad[1]));
      fill = g; bord = rgba(darken(grad[1],0.30), 0.9);
    } else {
      // 手足の色が指定されていないキャラは体と同じ色になり、付け根が体に溶ける。
      // 少し明度を落として輪郭が読めるようにする（原作の手足も体より暗い）。
      const col = over || darken(L.cell.colorRGB, 0.15);
      fill = rgb(col);
      bord = rgba(over ? darken(over,0.30) : darken(L.cell.borderRGB,0.1), 0.9);
    }
    drawTaper(ctx, L.x1,L.y1, L.x2,L.y2, w1, w2, fill, null, lw);
  }
  // 2 は白いソックス＋橙のキラキラしたダンスシューズを常時履いている
  if(f.shoes){
    for(const L of geo.legs) drawShoe(ctx, L, bs, f.shoes);
  }
  // 指があるのは 5 と 10 だけ。5 は片手（見る側の右手）、10 は両手
  const gl = spec.face.gloves;
  if(gl){
    // geo.arms[0]＝見る側の左腕, [1]＝見る側の右腕
    const targets = (gl.side==='both') ? [geo.arms[0], geo.arms[1]]
                  : (gl.side==='right') ? [geo.arms[1]] : [geo.arms[0]];
    for(const A of targets){
      const dir = (A === geo.arms[0]) ? -1 : 1;   // 手が体から外へ向く向き
      // 中指が「腕の延長線の方向」に伸びるよう、実際の腕ベクトルから角度を取る
      // （歩行アニメーションで腕が振れても追従する）
      const armAngle = Math.atan2(A.y2-A.y1, A.x2-A.x1) * 180/Math.PI;
      drawGlove(ctx, A.x2, A.y2, bs, gl, armAngle);
    }
  }
}

/** 2 の白いソックス＋橙のキラキラしたダンスシューズ */
function drawShoe(ctx, L, bs, sh){
  const dx = L.x2-L.x1, dy = L.y2-L.y1, len = Math.hypot(dx,dy)||1;
  const ux = dx/len, uy = dy/len;
  ctx.save();
  ctx.lineCap = 'round';
  // ソックス（足首のあたり）
  ctx.strokeStyle = rgb(sh.sock); ctx.lineWidth = bs*0.26;
  ctx.beginPath();
  ctx.moveTo(L.x2-ux*bs*0.19, L.y2-uy*bs*0.19);
  ctx.lineTo(L.x2-ux*bs*0.10, L.y2-uy*bs*0.10);
  ctx.stroke();
  // 靴（つま先が前に出た形）
  const toe = (L.x2 < L.x1) ? -1 : 1;
  ctx.translate(L.x2, L.y2);
  ctx.scale(toe, 1);                      // つま先の向き
  // 靴らしい形：かかとは丸く低く、甲が盛り上がり、つま先へ細く伸びる。輪郭線なし。
  const S = bs;
  ctx.beginPath();
  ctx.moveTo(-S*0.16, S*0.10);                                  // かかと下
  ctx.quadraticCurveTo(-S*0.22, S*0.10, -S*0.21, S*0.00);       // かかと後ろ
  ctx.quadraticCurveTo(-S*0.20, -S*0.13, -S*0.06, -S*0.13);     // 甲の立ち上がり
  ctx.quadraticCurveTo(S*0.12, -S*0.12, S*0.30, S*0.01);        // つま先へ
  ctx.quadraticCurveTo(S*0.34, S*0.10, S*0.24, S*0.10);         // つま先下
  ctx.closePath();
  ctx.fillStyle = rgb(sh.shoe); ctx.fill();
  // キラキラ
  if(sh.sparkle){
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for(const p of [[-0.05,-0.04],[0.14,-0.01],[0.04,0.05]]){
      starPath(ctx, p[0]*bs, p[1]*bs, bs*0.06, bs*0.024, 4, -Math.PI/2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** 指つきの手袋（5＝濃紺・片手／10＝白・両手。指は5本）
 * 手首を原点とし、ローカル+x＝腕の延長線（＝中指の方向）、+y＝てのひらを
 * 横切る方向、という座標系で組む（armAngleDeg がそのまま ctx.rotate に渡る）。
 *   ・中指：ローカル角0°＝腕の延長線そのまま
 *   ・人差し指／薬指／小指：ナックルラインに沿って根元をずらして並べ、
 *     隣接指との角度差はわずか（11°刻み）→ 位置差＋角度差で自然な隙間ができる
 *   ・親指：てのひらと腕の接続部（手首寄り）から、他4本とは45°開いて短く
 */
function drawGlove(ctx, hx, hy, bs, gl, armAngleDeg){
  const r = bs*0.30;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(armAngleDeg*Math.PI/180);
  ctx.fillStyle = rgb(gl.rgb);
  ctx.strokeStyle = rgb(gl.rgb);   // 指のストロークもこの色にする（既定は黒なので必須）
  ctx.lineCap = 'round';

  // てのひら：手首側から少し先まで。中指の指先方向（+x）へ1.2倍
  const px0 = -r*0.10, pw = r*1.15*1.2, py0 = -r*0.68, ph = r*1.36;
  ctx.beginPath();
  ctx.roundRect(px0, py0, pw, ph, r*0.5);
  ctx.fill();

  // 人差し指・中指・薬指・小指：ナックルライン上に根元をずらして並べる
  // （根元のx位置はてのひらの拡大に合わせて1.2倍）
  const knuckleX = r*0.85*1.2, rowSpacing = r*0.40;
  const fingerLen = r*1.05, fingerW = r*0.34, step = 11;
  const fingers = [
    { rowY:-1.5*rowSpacing, ang:-step },                    // 人差し指
    { rowY:-0.5*rowSpacing, ang:0 },                        // 中指（腕の延長線そのまま）
    { rowY: 0.5*rowSpacing, ang: step },                    // 薬指
    { rowY: 1.5*rowSpacing, ang: 2*step, pull:r*0.18 },     // 小指：手首方向へ平行移動して短く見せる
  ];
  ctx.lineWidth = fingerW;
  for(let i=0;i<Math.min(4, gl.fingers);i++){
    const f = fingers[i];
    const a = f.ang*Math.PI/180;
    const rx = knuckleX - (f.pull||0), ry = f.rowY;
    ctx.beginPath();
    ctx.moveTo(rx - Math.cos(a)*r*0.15, ry - Math.sin(a)*r*0.15);   // 根元をてのひら側へ埋める
    ctx.lineTo(rx + Math.cos(a)*fingerLen, ry + Math.sin(a)*fingerLen);
    ctx.stroke();
  }
  // 親指：人差し指から60°開き、根元は手のひらの端（人差し指側の角）へ
  if(gl.fingers>=5){
    const indexAng = -step;
    const ta = (indexAng-60)*Math.PI/180;
    const tx0 = r*0.10*1.2, ty0 = -r*0.60;
    ctx.lineWidth = fingerW*1.1;
    ctx.beginPath();
    ctx.moveTo(tx0, ty0);
    ctx.lineTo(tx0 + Math.cos(ta)*r*0.80, ty0 + Math.sin(ta)*r*0.80);
    ctx.stroke();
  }
  // てのひらの星（5）：てのひら中央へ、180度回転
  if(gl.star){
    ctx.save();
    ctx.translate(px0+pw/2, py0+ph/2);
    ctx.rotate((180-12)*Math.PI/180);
    starPath(ctx, 0, 0, r*0.34, r*0.15, 5, -Math.PI/2);
    ctx.fillStyle = 'rgba(120,180,255,0.95)';
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** 6：ブロック内にサイコロの目を薄く重ねる。value は 1〜6、下から順。 */
function sixPipPositions(v){
  const L=-0.5,R=0.5,C=0,T=-0.5,M=0,B=0.5;
  switch(v){
    case 1: return [[C,M]];
    case 2: return [[L,T],[R,B]];
    case 3: return [[L,T],[C,M],[R,B]];
    case 4: return [[L,T],[R,T],[L,B],[R,B]];
    case 5: return [[L,T],[R,T],[C,M],[L,B],[R,B]];
    case 6: return [[L,T],[R,T],[L,M],[R,M],[L,B],[R,B]];
  }
}
function drawSixPips(ctx, bx, by, bs, value){
  const cx = bx+bs/2, cy = by+bs/2, pr = bs*0.085;
  ctx.fillStyle = rgba(value===6 ? PIP_LIGHT : PIP_DARK, 0.55);
  for(const [lx,ly] of sixPipPositions(value)){
    ctx.beginPath();
    ctx.arc(cx+lx*bs*0.36, cy+ly*bs*0.36, pr, 0, Math.PI*2);
    ctx.fill();
  }
}

/** 目1つ */
function drawEye(ctx, ex, ey, rx, ry, shape, opts){
  opts = opts||{};
  if(shape==='star'){
    starPath(ctx, ex, ey, rx*1.15, rx*0.50, 5, -Math.PI/2);
    if(opts.rimRGB){
      // 5：目そのものが星の形（白目＋濃紺のふち＋黒目）
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.lineWidth = STROKE; ctx.strokeStyle = rgb(opts.rimRGB); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex, ey, rx*0.52, 0, Math.PI*2);
      ctx.fillStyle = rgb(opts.irisRGB || [22,22,30]); ctx.fill();
      ctx.beginPath(); ctx.arc(ex-rx*0.18, ey-rx*0.18, rx*0.17, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
    } else {
      // 10：赤いベタ塗りの星
      ctx.fillStyle = rgb(opts.starRGB||DIGIT_COLORS[1]); ctx.fill();
      ctx.lineWidth = STROKE;
      ctx.strokeStyle = 'rgba(110,0,10,0.85)'; ctx.stroke();
    }
    return;
  }
  ctx.beginPath();
  if(shape==='square')      ctx.roundRect(ex-rx, ey-rx, rx*2, rx*2, rx*0.26);
  else if(shape==='rect')   ctx.roundRect(ex-rx*1.28, ey-ry*0.78, rx*2.56, ry*1.56, ry*0.30);
  // 縦長長方形：横幅を狭め、縦を伸ばした角丸長方形（rect の縦横を入れ替えた形）
  else if(shape==='rectTall') ctx.roundRect(ex-rx*0.78, ey-ry*1.28, rx*1.56, ry*2.56, rx*0.30);
  // 7：横幅を約2倍に広げた角丸長方形
  else if(shape==='rectWide') ctx.roundRect(ex-rx*1.9, ey-ry*0.78, rx*3.8, ry*1.56, ry*0.34);
  else                      ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI*2);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  // 目のふちは太いリング（直径の15%）。2 の紫の楕円＝メガネ風、4 の濃緑など
  ctx.lineWidth = opts.rimW || STROKE;
  ctx.strokeStyle = opts.rimRGB ? rgb(opts.rimRGB) : 'rgba(26,26,38,0.92)';
  ctx.stroke();

  // 黒目：白目の内径の約60%。白目が楕円なら黒目も「相似な楕円」にする
  const rimHalf = (opts.rimW||STROKE)/2;
  const prx = (rx - rimHalf) * 0.60;
  const pry = (shape==='rect' ? (ry - rimHalf) : (ry - rimHalf)) * 0.60;
  // 瞳を顔の中心寄りにわずかにずらす（7：見つめ合うような表情）
  const pex = ex + (opts.pupilOffsetX||0);
  ctx.beginPath(); ctx.ellipse(pex, ey+ry*0.06, prx, pry, 0, 0, Math.PI*2);
  ctx.fillStyle = rgb(opts.irisRGB || [22,22,30]); ctx.fill();
  // ハイライト
  const pr = Math.min(prx, pry);
  ctx.beginPath(); ctx.arc(pex-prx*0.34, ey+ry*0.06-pry*0.34, pr*0.32, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();

  // まつげ（6：目の上に3本）
  if(opts.lashes>0){
    ctx.strokeStyle = opts.lashRGB ? rgb(opts.lashRGB) : (opts.rimRGB?rgb(opts.rimRGB):'rgba(26,26,38,0.92)');
    const rr = Math.max(rx,ry);
    ctx.lineWidth = rr*0.11;
    ctx.lineCap = 'round';
    const spread = [-40,-15,10];
    for(let i=0;i<opts.lashes && i<spread.length;i++){
      const rad = (spread[i]-90)*Math.PI/180;
      const x1=ex+Math.cos(rad)*rr*0.85, y1=ey+Math.sin(rad)*rr*0.85;
      const x2=ex+Math.cos(rad)*rr*1.55, y2=ey+Math.sin(rad)*rr*1.55;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    }
  }

  // 11 の赤いまぶた
  if(opts.redLid){
    ctx.save();
    ctx.beginPath();
    if(shape==='square') ctx.rect(ex-rx, ey-rx, rx*2, rx*0.85);
    else                 ctx.rect(ex-rx*1.1, ey-ry*1.1, rx*2.2, ry*0.9);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(ex, ey, rx*1.02, ry*1.02, 0, 0, Math.PI*2);
    ctx.fillStyle = rgba(DIGIT_COLORS[1],0.95); ctx.fill();
    ctx.restore();
  }
}

/**
 * 三日月型の口（笑った口）＋くちびる＋白い歯。
 * 上辺はほぼ直線、下辺が大きく下にふくらむ弧。上辺に沿って白い歯が覗く。
 * 歯の本数はキャラ固有（4 は原文に "four curved top teeth"）。
 */
/* 三日月型の口。両端をレンズ状に尖らせると、口の幅いっぱいに歯が並ばず
   「指定より小さい口」に見えてしまうので、両端に少し高さ（端の切り口）を持たせる。
   くちびるを丸い継ぎ目で描くので、切り口は丸まって見える。 */
/* 口の輪郭。参照画像の 1 を実測した結果、両端の尖った「レンズ型」ではなく
   ・上辺 … ほぼ直線（ごくわずかに下に凸）
   ・下辺 … 半円状に深く膨らむ
   という「半月型（Dを180°回した形）」だった。両端は尖らず、上辺の左右端で閉じる。
   dTop / dBot は内側（歯の帯を作るための縮小）に使う。 */
function crescentPath(ctx, cx, cy, w, h, dTop, dBot){
  const t = dTop||0, b = dBot||0;
  const hw  = Math.max(1, w/2 - (t+b)*0.5);   // 内側は横も縮める
  const top = cy - h*0.50 + t;
  const bot = cy + h*0.50 - b;
  const H   = Math.max(1, bot - top);
  ctx.beginPath();
  ctx.moveTo(cx-hw, top);
  ctx.quadraticCurveTo(cx, top + H*0.24, cx+hw, top);   // 上辺：ゆるく下に凸
  // 下辺：制御点を top+2H に置くと曲線の最下点がちょうど bot になる（半円状）
  ctx.quadraticCurveTo(cx, top + H*2.0,  cx-hw, top);
  ctx.closePath();
}
function drawMouth(ctx, cx, cy, w, h, lipRGB, teeth, bs, lipW, opts){
  opts = opts || {};
  ctx.save();
  // 口全体をわずかに傾ける（1 は画面向かって左の口角が少し上がる）
  if(opts.tilt){
    ctx.translate(cx, cy); ctx.rotate(opts.tilt*Math.PI/180); ctx.translate(-cx, -cy);
  }

  // 口の中（暗い赤）
  crescentPath(ctx, cx, cy, w, h);
  ctx.fillStyle = '#2a0a10'; ctx.fill();

  ctx.save();
  crescentPath(ctx, cx, cy, w, h); ctx.clip();

  if(opts.teethStyle === 'bands'){
    // 上の歯：上辺に沿った「1本のつながった白い帯」。歯を区切る縦線は描かない。
    crescentPath(ctx, cx, cy, w, h);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    crescentPath(ctx, cx, cy, w, h, h*0.30, 0);        // 帯の下を暗く抜く
    ctx.fillStyle = '#2a0a10'; ctx.fill();
    // 下の歯：くちびるに沿った帯ではなく「楕円」。口の下寄りに置き、
    // クリップで口の内側に収まった部分だけが見える。
    ctx.beginPath();
    ctx.ellipse(cx, cy + h*0.46, w*0.30, h*0.30, 0, 0, Math.PI*2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
    crescentPath(ctx, cx, cy, w, h);
    ctx.lineWidth = Math.max(1, lipW || w*0.17);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = rgb(lipRGB); ctx.stroke();
    ctx.restore();
    return;
  }

  // 舌（口の下半分）
  ctx.beginPath();
  ctx.ellipse(cx, cy+h*0.62, w*0.42, h*0.95, 0, 0, Math.PI*2);
  ctx.fillStyle = '#e2607a'; ctx.fill();
  // 白い歯：口の上辺に沿って並べ、口の上半分を占める
  const nT = Math.max(0, teeth|0);
  if(nT>0){
    const band = h*0.95;                       // 歯の高さ（上半分を埋める）
    const tw = w/nT;
    ctx.fillStyle = '#ffffff';
    for(let i=0;i<nT;i++){
      const tx = cx - w/2 + tw*i;
      const t  = (i+0.5)/nT;
      const arc = h*0.30 * 4*t*(1-t);          // 上辺のゆるい弧に沿わせる
      const ty = cy - h*0.44 + arc;
      ctx.beginPath();
      ctx.roundRect(tx+tw*0.03, ty, tw*0.94, band, [0,0,tw*0.36,tw*0.36]);
      ctx.fill();
    }
    // 歯どうしの区切り
    ctx.strokeStyle = 'rgba(150,110,120,0.45)';
    ctx.lineWidth = Math.max(0.5, (bs||20)*0.012);
    for(let i=1;i<nT;i++){
      const tx = cx - w/2 + tw*i;
      ctx.beginPath(); ctx.moveTo(tx, cy-h*0.6); ctx.lineTo(tx, cy+h*0.6); ctx.stroke();
    }
  }
  ctx.restore();

  // くちびる：口の全周を均一な太さのリングで囲む
  crescentPath(ctx, cx, cy, w, h);
  ctx.lineWidth = Math.max(1, lipW || w*0.17);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = rgb(lipRGB); ctx.stroke();
  ctx.restore();
}

/**
 * Step Squad（三角数）のマスク。大文字「M」の左下と右下をつないだような形
 * （参照画像より）：外側（両端）がいちばん高い山、中央へ向かって1列ずつ
 * 均等に低くなり、中央が谷になる。縁取りはしない。色は steps 段ぶん、
 * 外側=steps番目の色→中央=1番目の色になる（28の虹色7段が
 * 「7 6 5 4 3 2 1｜1 2 3 4 5 6 7」に並ぶのが公式仕様）。
 * 体からはみ出さないようクリップする。
 */
/** マスクを描いてよいマスの集合＝「体のシルエット＋その内側の穴」。
 * 外周から辿り着けない空きマス（囲まれた穴）だけを内側とみなすので、
 * 階段形状の段の外側にある空白は含まれない。 */
function maskClipCells(spec){
  if(_maskClipCache[spec.n]) return _maskClipCache[spec.n];
  const filled = new Set(spec.cells.map(c => c.gx+','+c.gy));
  // 外周を1マス広げた盤面で、外側から空きマスを塗りつぶす（届いた＝外）
  const outside = new Set();
  const stack = [[-1,-1]];
  const inRange = (gx,gy) => gx>=-1 && gy>=-1 && gx<=spec.cols && gy<=spec.rows;
  while(stack.length){
    const [gx,gy] = stack.pop();
    const k = gx+','+gy;
    if(!inRange(gx,gy) || outside.has(k) || filled.has(k)) continue;
    outside.add(k);
    stack.push([gx+1,gy], [gx-1,gy], [gx,gy+1], [gx,gy-1]);
  }
  const out = spec.cells.map(c => ({gx:c.gx, gy:c.gy}));
  for(let gy=0; gy<spec.rows; gy++){
    for(let gx=0; gx<spec.cols; gx++){
      const k = gx+','+gy;
      if(!filled.has(k) && !outside.has(k)) out.push({gx, gy});   // 囲まれた穴
    }
  }
  _maskClipCache[spec.n] = out;
  return out;
}

function drawMask(ctx, spec, x, y, bs, cx, cy, mw, steps, u){
  const st = maskStyle(steps);
  ctx.save();
  // クリップ範囲は「体のシルエット＋その内側の穴」。
  // マスクはブロックへのペイントではないので、シルエットの内側なら
  // ブロックが無いマス（囲まれた穴）にも描く。一方、15・21 のような
  // 階段形状で段の外側にある空白は「外」なので描いてはいけない
  // （外接矩形でクリップすると、そこにマスクがはみ出してしまう）。
  ctx.beginPath();
  for(const c of maskClipCells(spec)) ctx.rect(x+c.gx*bs, y+c.gy*bs, bs+0.6, bs+0.6);
  ctx.clip();

  const n = Math.max(1, steps);
  const bandBottom = cy + u*0.30;   // 柱の下端＝目のすぐ下あたり
  const peakTop     = cy - u*1.15;   // 両端の山の頂点の高さ
  const colW = (mw/2) / n;
  const left = cx - mw/2;
  const isWhiteBase = st.fill && st.fill[0]===255 && st.fill[1]===255 && st.fill[2]===255;
  // 中央の谷が浅すぎたので全体を底上げする（陽太さん指定：どの柱も一律 +25px 相当、u=60換算）
  const heightBoost = u * (25/60);

  for(let i=1; i<=n; i++){
    // i=1(端)がいちばん高く、i=n(中央)へ向けて均等に低くなる
    const colTop = bandBottom + (peakTop-bandBottom)*(n-i+1)/n - heightBoost;
    const level = n - i + 1;                                 // i=1→外側の色番号(n)、i=n→中央の色番号(1)
    let col;
    if(st.rainbow) col = RAINBOW[Math.min(6, Math.max(0, level-1))];
    else if(isWhiteBase) col = (level % 2 === 1) ? st.fill : st.border;  // 白地キャラは縞にする
    else col = st.fill;
    ctx.fillStyle = rgb(col);

    const lx0 = left + colW*(i-1);
    ctx.fillRect(lx0, colTop, colW, bandBottom-colTop);      // 左側の柱
    ctx.fillRect(cx*2-(lx0+colW), colTop, colW, bandBottom-colTop);  // 右側（鏡像）
  }

  // k>=11 は 一の位の色のアクセントを一番外側の柱に重ねる（11→赤, 12→橙, 13→黄）
  if(st.accent){
    const accTop = peakTop - heightBoost;
    ctx.fillStyle = rgb(st.accent);
    ctx.fillRect(left, accTop, colW, bandBottom-accTop);
  }

  ctx.restore();
}

/**
 * 3 のジェスター帽。原文："a jester hat on her top block that doubles as a
 * uni-brow; the triangular parts are red and the circular parts are yellow"、
 * Trivia に "a red 3-pointed 2D-ish jester hat"。
 * 尖り3つ・三角が赤・先の玉が黄色。目の上に乗って一本眉のようにも見える。
 */
function drawJesterHat(ctx, cx, baseY, u){
  // 参照画像では帽子は頭のてっぺんに「幅広く・低く」乗り、尖りが3つ立つ。
  // 輪郭線は付けない（原作はベタ塗り）。
  // 参照画像では3つの尖りが「左・真ん中・右」に並び、外側ほど大きく倒れる扇型。
  // 根元をつなぐ帯は無し。輪郭線も付けない。
  const hornScale = 0.8;
  const L = u*0.60*hornScale, halfW = u*0.20*hornScale, spanX = u*0.30, tipR = u*0.062*hornScale;
  // 真ん中の1本だけ少し高い位置から生やす
  const horns = [ {x:-spanX, a:-27, dy:0}, {x:0, a:0, dy:-u*0.08}, {x:spanX, a:27, dy:0} ];
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.translate(cx, baseY);
  for(const hn of horns){
    ctx.save();
    ctx.translate(hn.x, hn.dy || 0);
    ctx.rotate(hn.a*Math.PI/180);
    ctx.fillStyle = rgb(DIGIT_COLORS[1]);
    // 直線の三角形ではなく、側面がふくらんで先端が丸い円錐状。
    // 根元も直線でつながず、内側にゆるくくぼむ曲線にする。
    ctx.beginPath();
    ctx.moveTo(-halfW, u*0.05);
    ctx.quadraticCurveTo(-halfW*0.98, -L*0.55, -tipR*0.92, -L+tipR);
    ctx.arc(0, -L+tipR, tipR, Math.PI, 0);   // 丸い先端
    ctx.quadraticCurveTo(halfW*0.98, -L*0.55, halfW, u*0.05);
    ctx.quadraticCurveTo(0, -u*0.03, -halfW, u*0.05);   // 根元の曲線（内側にくぼむ）
    ctx.fill();
    // 先端の丸い玉（黄）
    ctx.fillStyle = rgb(DIGIT_COLORS[3]);
    ctx.beginPath(); ctx.arc(0, -L-u*0.02, u*0.11, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** 3 の中央ブロックのジャグリングボール3個（ボタン代わり） */
function drawButtons(ctx, cx, cy, u, count){
  ctx.save();
  // 参照画像では赤い玉が「縦一列」に並ぶ（横並びではない）。輪郭線は付けない
  ctx.fillStyle = rgb(DIGIT_COLORS[1]);
  for(let i=0;i<count;i++){
    const by = cy + (i-(count-1)/2)*u*0.28;   // ブロック1個に収まる間隔
    ctx.beginPath(); ctx.arc(cx, by, u*0.115, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

/**
 * 7 の髪。原文："7 strings of multicoloured hair (where the even-numbered hairs
 * are longer and the odd-numbered hairs are shorter)" ＝7本・長短が交互・虹色。
 */
function drawHair(ctx, cx, topY, u, count){
  ctx.save();
  ctx.lineCap = 'round';
  const spread = u*0.90;
  for(let i=0;i<count;i++){
    const t = (count===1) ? 0.5 : i/(count-1);
    const hx = cx - spread/2 + spread*t;
    // 2本目・4本目…（偶数番目）が長い
    const len = ((i+1)%2===0) ? u*0.62 : u*0.38;
    const lean = (t-0.5)*u*0.55;
    ctx.strokeStyle = rgb(RAINBOW[i%7]);
    ctx.lineWidth = STROKE*1.8;
    ctx.beginPath();
    ctx.moveTo(hx, topY);
    ctx.quadraticCurveTo(hx+lean*0.5, topY-len*0.6, hx+lean, topY-len);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 8 のヒーローマスク。原文：∞（無限大記号）の形をした dark purple のマスクで
 * トゲが8本（片側4本ずつ）。※Wiki の Eight ページに同居する Octonaughty
 *（緑の触手・緑マスク）とは別物なので混同しないこと。
 */
function drawInfinityMask(ctx, cx, cy, half, rx, ry, u){
  const col = [58, 22, 92];               // dark purple
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(darken(col,0.35),0.95);
  ctx.lineWidth = STROKE;
  ctx.fillStyle = rgb(col);
  // トゲ：左右に4本ずつ＝計8本
  for(const side of [-1, 1]){
    const ox = cx + side*half;
    for(let i=0;i<4;i++){
      const a = (-0.75 + i*0.5) * side + (side<0 ? Math.PI : 0);
      const len = rx*(i===1||i===2 ? 1.85 : 1.45);
      ctx.beginPath();
      ctx.moveTo(ox + Math.cos(a-0.22)*rx*1.05, cy + Math.sin(a-0.22)*ry*1.05);
      ctx.lineTo(ox + Math.cos(a)*len,          cy + Math.sin(a)*len*0.95);
      ctx.lineTo(ox + Math.cos(a+0.22)*rx*1.05, cy + Math.sin(a+0.22)*ry*1.05);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  // ∞の本体：左右の輪＋中央のくびれ
  ctx.beginPath();
  ctx.ellipse(cx-half, cy, rx*1.30, ry*1.25, 0, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx+half, cy, rx*1.30, ry*1.25, 0, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx-half, cy-ry*0.55);
  ctx.quadraticCurveTo(cx, cy-ry*0.20, cx+half, cy-ry*0.55);
  ctx.lineTo(cx+half, cy+ry*0.55);
  ctx.quadraticCurveTo(cx, cy+ry*0.20, cx-half, cy+ry*0.55);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** 20 のシルクハット（橙と紫）。Wiki に寸法の記述がないので
    「幅は本体幅の6割以下・高さは1マス程度」に収める */
function drawTopHat(ctx, cx, baseY, bw, u, bs){
  const brimW = Math.min(bw*0.60, bs*2.2), brimH = bs*0.16;
  const crownW = brimW*0.66, crownH = bs*0.95;
  const cy = baseY - brimH;
  // 山（橙と紫の縞）
  ctx.save();
  ctx.beginPath(); ctx.roundRect(cx-crownW/2, cy-crownH, crownW, crownH, u*0.10);
  ctx.fillStyle = rgb(DIGIT_COLORS[2]); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = rgb(DIGIT_COLORS[6]);
  ctx.fillRect(cx-crownW/2, cy-crownH*0.42, crownW, crownH*0.22);
  ctx.restore();
  ctx.lineWidth=STROKE; ctx.strokeStyle='rgba(30,20,50,0.85)';
  ctx.beginPath(); ctx.roundRect(cx-crownW/2, cy-crownH, crownW, crownH, u*0.10); ctx.stroke();
  // つば
  ctx.beginPath(); ctx.ellipse(cx, cy, brimW/2, brimH, 0,0,Math.PI*2);
  ctx.fillStyle = rgb(DIGIT_COLORS[6]); ctx.fill();
  ctx.lineWidth=STROKE; ctx.strokeStyle='rgba(30,20,50,0.85)'; ctx.stroke();
  ctx.restore();
}

/** 26（エージェント）の黒い中折れ帽（フェドーラ）。
 * 20 のシルクハットと違い、山が低く、つばが横に広く、中央がへこむ。 */
function drawFedora(ctx, cx, baseY, bw, u, bs){
  const brimW = Math.min(bw*0.72, bs*2.6), brimH = bs*0.13;
  const crownW = brimW*0.52, crownH = bs*0.62;
  const cy = baseY - brimH;
  const BLACK = '#22222a', EDGE = 'rgba(10,10,16,0.9)';
  ctx.save();
  ctx.lineWidth = STROKE; ctx.lineJoin = 'round';
  // つば（両端がわずかに反り上がる楕円）
  ctx.beginPath(); ctx.ellipse(cx, cy, brimW/2, brimH, 0, 0, Math.PI*2);
  ctx.fillStyle = BLACK; ctx.fill();
  ctx.strokeStyle = EDGE; ctx.stroke();
  // 山（上辺の中央がへこむ＝中折れ）
  const top = cy - crownH, L = cx - crownW/2, R = cx + crownW/2;
  ctx.beginPath();
  ctx.moveTo(L, cy);
  ctx.lineTo(L, top + crownH*0.18);
  ctx.quadraticCurveTo(L + crownW*0.10, top, cx - crownW*0.16, top + crownH*0.10);
  ctx.quadraticCurveTo(cx, top + crownH*0.34, cx + crownW*0.16, top + crownH*0.10);  // 中央のへこみ
  ctx.quadraticCurveTo(R - crownW*0.10, top, R, top + crownH*0.18);
  ctx.lineTo(R, cy);
  ctx.closePath();
  ctx.fillStyle = BLACK; ctx.fill();
  ctx.strokeStyle = EDGE; ctx.stroke();
  ctx.restore();
}

/** 26（エージェント）の黒いサングラス。上辺は直線、下辺が丸いレンズ2枚。 */
function drawSunglasses(ctx, cx, cy, half, rx, ry){
  const lw = rx*1.55, lh = ry*1.30;          // レンズの半幅・高さ
  const top = cy - ry*0.62;
  ctx.save();
  ctx.fillStyle = '#191921';
  ctx.strokeStyle = 'rgba(8,8,14,0.95)';
  ctx.lineWidth = STROKE;
  for(const s of [-1, 1]){
    const ex = cx + s*half;
    ctx.beginPath();
    ctx.moveTo(ex-lw, top);
    ctx.lineTo(ex+lw, top);
    ctx.lineTo(ex+lw, top+lh*0.30);
    // 下辺は外側から内側へ向かって丸く落とす
    ctx.quadraticCurveTo(ex+lw*0.72, top+lh, ex-lw*0.20, top+lh*0.96);
    ctx.quadraticCurveTo(ex-lw*0.80, top+lh*0.86, ex-lw, top+lh*0.26);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  // ブリッジ（2枚をつなぐ橋）
  ctx.lineWidth = STROKE*1.6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx-half+lw*0.92, top+lh*0.16);
  ctx.lineTo(cx+half-lw*0.92, top+lh*0.16);
  ctx.stroke();
  ctx.restore();
}

/** 26（エージェント）の白い襟＋黒いネクタイ */
function drawNecktie(ctx, cx, topY, u){
  ctx.save();
  ctx.lineWidth = STROKE; ctx.lineJoin = 'round';
  // 白い襟（左右から中央下へ向かうV字）
  const cw = u*0.46, ch = u*0.42;
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(40,40,60,0.85)';
  for(const s of [-1, 1]){
    ctx.beginPath();
    ctx.moveTo(cx + s*cw, topY);
    ctx.lineTo(cx + s*cw*0.30, topY);
    ctx.lineTo(cx, topY + ch);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  // 黒いネクタイ（結び目＋垂れ）
  ctx.fillStyle = '#22222a'; ctx.strokeStyle = 'rgba(8,8,14,0.9)';
  const ky = topY + ch*0.42, kw = u*0.17, kh = u*0.17;
  ctx.beginPath();
  ctx.moveTo(cx, ky-kh*0.5); ctx.lineTo(cx+kw, ky); ctx.lineTo(cx, ky+kh*0.5); ctx.lineTo(cx-kw, ky);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  const ty = ky + kh*0.5, tw = u*0.21, tl = u*0.52;
  ctx.beginPath();
  ctx.moveTo(cx, ty); ctx.lineTo(cx+tw, ty+tl*0.55); ctx.lineTo(cx, ty+tl); ctx.lineTo(cx-tw, ty+tl*0.55);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/** 20 の白い蝶ネクタイ */
function drawBowtie(ctx, cx, cy, u){
  ctx.save();
  ctx.fillStyle='#ffffff'; ctx.strokeStyle='rgba(40,40,60,0.85)';
  ctx.lineWidth=STROKE;
  const w=u*0.52, h=u*0.42;
  ctx.beginPath();
  ctx.moveTo(cx-w, cy-h); ctx.lineTo(cx-u*0.10, cy); ctx.lineTo(cx-w, cy+h); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx+w, cy-h); ctx.lineTo(cx+u*0.10, cy); ctx.lineTo(cx+w, cy+h); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(cx-u*0.13, cy-u*0.15, u*0.26, u*0.30, u*0.07);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

/* ── 顔ジオメトリ（キャラごとに調整可能） ────────────────────────
   Wiki には目・口の大きさや位置の数値が一切ないため、実物を見ながら
   陽太さんが「調整」パネルで詰められるようにテーブル化してある。
   未設定のキャラは FACE_GEOM_DEFAULT にフォールバックする。
     eyeScale     目の大きさ倍率
     mouthScale   口の大きさ倍率
     mouthOffsetX 口の左右ずらし（u 単位。口は左右対称ではなく片側に寄る）
     mouthOffsetY 口の上下ずらし（u 単位）
     faceOffsetY  顔全体の上下ずらし（体の高さに対する割合）           */
const FACE_GEOM_DEFAULT = {
  faceScale:1,          // 顔全体の倍率（1マス基準）
  eyeScale:1,           // 目の直径＝セルの52%×これ
  mouthScale:1,         // 口の横幅＝セルの44%×これ
  // 口は顔の右寄り＝見る側の左寄りに置く（参照画像より）。傾きとセットで非対称にする
  mouthOffsetX:-0.07,
  mouthOffsetY:0,       // 既定の口の縦位置＝セル上端から75%
  faceOffsetY:0,        // 顔全体の上下（セル1辺に対する割合）
  // ── ここから下は「編集ツール」用の上書き項目。null/undefined は
  //    「上書きしない＝キャラ固有の既定（faceSpec）を使う」という意味。
  //    pick() でこの区別を行うので、ここでは値を書かず全部 null にしておく。
  eyeShape:null, eyeRimRGB:null, lashes:null, lashRGB:null,
  lipRGB:null, limbRGB:null, limbGrad:null,
  armAnchor:null, mouthTilt:null, teethStyle:null,
  pupilShift:null,       // 瞳の中心寄せ（rx 単位）。null＝キャラ既定（7のみ既定で少し寄る）
  // 顔を「上から何行目」に置くか。null＝既定の0行目（かたちの一番上）。
  // 一の位のバラブロックが上に来る配置（17など）で、顔を十のかたまり側の
  // 行に動かしたいときに使う。左右中心（cx）もこの行の実在マスから決め直す。
  faceRow:null,
  // 腕の付け根を「上から何行目」に置くか。null＝既定（spec.rows*0.34 を四捨五入）
  armRow:null,
  // 目と目の間隔の倍率。null＝1（既定の間隔）
  eyeGap:null,
  // 眉：形（rect/line/zigzag/none）・角度（flat/drooping/rising）・色・目からの距離（倍率）。
  // null＝キャラ固有の既定（faceSpec の eyebrows）を使う
  eyebrowShape:null, eyebrowTilt:null, eyebrowRGB:null, eyebrowGap:null
};
/** override が null/undefined なら fallback を使う（0 は有効な上書き値として扱う） */
function pick(override, fallback){ return (override===null || override===undefined) ? fallback : override; }
const FACE_GEOM = {
  // 1 は目のほうが口より大きい（参照画像より）。既定のままだと口が勝ってしまう
  // 目を1.2倍にすると口と接触するので、口をわずかに下げて逃がす
  1:{ mouthScale:0.70, eyeScale:1.2, mouthOffsetY:0.05 },
  // 4：目は少し下、口は左下ブロック寄りだが中央やや上（参照画像）
  4:{ faceOffsetY:0.14, mouthOffsetY:0.42, mouthOffsetX:-0.22 },
  // 6：1×6なので目は自動で縁ぎりぎりに寄る。口は向かって左下へ
  6:{ eyeScale:0.56, mouthOffsetX:-0.20, mouthOffsetY:0.12 },
  // 7：6とほぼ同じ口位置。目は角丸四角形（自動で縁に寄る）
  7:{ eyeScale:0.56, mouthOffsetX:-0.20, mouthOffsetY:0.12 },
  // 3：目は小さめ。小さくすると左右の間隔が広がり、両目が接触しなくなる
  3:{ eyeScale:0.85 },
  // 5：目は小さめ。小さくすると左右の間隔（体幅いっぱいまで開く）も自動で広がる
  5:{ eyeScale:0.85 },
  // 20 は10の倍数で唯一、顔が「下寄り」（Twenty / Trivia）
  20:{ faceOffsetY:4.2 },
  // 30 は「口が Three よりずっと大きい」（Thirty / Appearance）
  30:{ mouthScale:1.35 },
  // 60 は「目が口からずっと離れている」（Sixty / Appearance）
  60:{ mouthOffsetY:0.30 }
  // ※ 陽太さんがキャラメイクで詰めた調整値はここには書かない。
  //    overrides.js（自動生成）側に入り、この表より優先される。
};
function getFaceGeom(n){
  const g = {};
  for(const k in FACE_GEOM_DEFAULT) g[k] = FACE_GEOM_DEFAULT[k];
  const base = FACE_GEOM[n]; if(base) for(const k in base) g[k] = base[k];
  const ovr = overrideFaceGeom(n); if(ovr) for(const k in ovr) g[k] = ovr[k];
  const usr = FACE_GEOM_USER[n]; if(usr) for(const k in usr) g[k] = usr[k];
  return g;
}

/** 眉を1本描く角度（度）。s=-1(左目側)/+1(右目側)を掛けて左右対称にする。
 * drooping＝外側が下がる（タレ眉）／rising＝外側が上がる（吊り眉） */
const EYEBROW_TILT_DEG = { flat:0, drooping:12, rising:-14 };

/** 眉2本を描く（shape: rect/line/zigzag, tilt: flat/drooping/rising） */
function drawEyebrows(ctx, cx, cy, half, rx, ry, shape, tilt, rgbCol, gap){
  const deg = EYEBROW_TILT_DEG[tilt] != null ? EYEBROW_TILT_DEG[tilt] : 0;
  gap = (gap==null) ? 1 : gap;   // 目からの距離の倍率（既定1）
  ctx.save();
  ctx.fillStyle = rgb(rgbCol);
  ctx.strokeStyle = rgb(rgbCol);
  for(const s of [-1, 1]){
    const bx = cx + s*half;
    let by, bw, bh;
    if(shape==='rect'){ by = cy - ry*2.05*gap; bw = rx*1.55; bh = ry*0.85; }
    else               { by = cy - ry*1.35*gap; bw = rx*1.5; bh = ry*0.32; }
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(s * deg * Math.PI/180);   // drooping: 外側が下がる／rising: 外側が上がる
    if(shape==='rect'){
      ctx.beginPath(); ctx.rect(-bw/2, -bh/2, bw, bh); ctx.fill();
    } else if(shape==='zigzag'){
      ctx.lineWidth = bh*0.55; ctx.lineCap='round'; ctx.lineJoin='round';
      const seg = 4, stepX = bw/seg;
      ctx.beginPath();
      for(let i=0; i<=seg; i++){
        const px = -bw/2 + stepX*i;
        const py = (i%2===0) ? -bh*0.35 : bh*0.35;
        if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    } else {   // 'line'：長い角丸長方形（水平の直線に見える）
      ctx.beginPath(); ctx.roundRect(-bw/2, -bh/2, bw, bh, bh*0.5); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

/** 顔一式 */
function drawFace(ctx, spec, x, y, bs, geo){
  const f = spec.face;
  const G = getFaceGeom(spec.n);
  const w = spec.cols*bs, h = spec.rows*bs;

  // 顔は「その行（既定は一番上の2段）が実際に存在する範囲」の中央に置く。
  // 15 のような階段状でも顔が空中に浮かないようにするため。
  // faceRow を指定すると、その行から2段を顔の基準にする（17のように一の位が
  // 上に来る配置で、顔を十のかたまり側の行へ動かしたいときに使う）。
  const faceRow = pick(G.faceRow, 0);
  const bandTop = faceRow, bandBot = faceRow + Math.min(2, spec.rows);
  let minGx = Infinity, maxGx = -Infinity;
  for(const c of spec.cells){
    if(c.gy >= bandTop && c.gy < bandBot){ if(c.gx<minGx) minGx=c.gx; if(c.gx>maxGx) maxGx=c.gx; }
  }
  if(minGx===Infinity){ minGx=0; maxGx=spec.cols-1; }
  const bandW = (maxGx-minGx+1)*bs;
  const cx = x + (minGx + maxGx + 1)/2 * bs;

  // 顔の寸法はすべて「1マス（セル）の1辺」基準。キャラ全体の大きさには比例させない。
  // → 1 の顔は1ブロックいっぱいに見え、100 でも目の大きさは同じセル基準になる。
  const u = bs * G.faceScale;

  // 目：外周（縁を含む）の直径＝セルの52%、縁の太さ＝直径の15%
  // faceScale は「顔全体」なので目・口どちらにも掛ける（以前は u（付属品）にしか
  // 効いておらず、実質「目の間隔」だけが動く見た目になっていた）
  const eyeD  = bs * 0.52 * G.eyeScale * G.faceScale;
  const rimW  = eyeD * 0.15;
  const rWhite = (eyeD - rimW) / 2;             // 白目の半径（縁は中心線上に引く）
  const rOut   = eyeD / 2;

  // 縦位置：目は faceRow 行目の上端から38%、口は75%（既定は一番上のブロックの中）
  const cy = y + bs*(faceRow+0.38) + bs*G.faceOffsetY;

  // マスク（目の後ろに敷く）
  if(f.mask>0){
    drawMask(ctx, spec, x, y, bs, cx, cy, Math.min(w*1.02, u*3.0), f.mask, u);
  }

  // 口を先に描く。目のあとに描くと、くちびるのリングが目のリングに重なって
  // 目が「9」のような形に見えてしまうため。
  // 「口の横幅＝セルの44%」は “開いている口の幅”。くちびるはその外側に
  // 幅の17%の太さで巻く。つまり外径は 0.44+0.075 になる。
  const mouthOpen = bs*0.44*G.mouthScale*G.faceScale;
  // くちびるを太くしすぎると、口の内側（上下の歯の帯）を食い潰してしまう。
  // 口の高さは幅の 0.42 倍あり、その中に「白帯／暗い内側／白帯」を収める必要がある。
  const lipW      = mouthOpen*0.13;
  const mouthW    = mouthOpen + lipW;               // くちびるの中心線の幅
  const mouthY = y + bs*(faceRow+0.80+G.mouthOffsetY) + bs*G.faceOffsetY;
  // 編集ツールでの上書き値（null なら faceSpec の既定を使う）
  const eyeShape   = pick(G.eyeShape,   f.eyeShape);
  const eyeRimRGB  = pick(G.eyeRimRGB,  f.eyeRimRGB);
  const lashes     = pick(G.lashes,     f.lashes);
  const lashRGB    = pick(G.lashRGB,    f.lashRGB);
  const lipRGB     = pick(G.lipRGB,     f.lipRGB);
  const mouthTilt  = pick(G.mouthTilt,  f.mouthTilt);
  const teethStyle = pick(G.teethStyle, f.teethStyle);

  const mouthX = cx + bs*G.mouthOffsetX;
  drawMouth(ctx, mouthX, mouthY, mouthW, mouthW*0.54, lipRGB, f.teeth, bs, lipW,
            { tilt:mouthTilt, teethStyle:teethStyle });

  const isRect = (eyeShape==='rect' || eyeShape==='rectWide');
  // 両目の間隔。体の幅からはみ出さないところまで詰める（1マス幅なら目同士が接する）。
  // eyeGap（編集ツールの上書き。既定1）でさらに調整できる
  const eyeGap = pick(G.eyeGap, 1);
  const half = Math.min(u * (isRect ? 0.52 : 0.44), Math.max(0, bandW/2 - rOut)) * eyeGap;
  const asp = f.eyeAspect || 1;
  const rx = rWhite/asp, ry = rWhite*asp;   // 2 は縦長の楕円

  const eyeOpts = { irisRGB:f.irisRGB, redLid:f.redLid, starRGB:DIGIT_COLORS[1],
                    rimRGB:eyeRimRGB, rimW:rimW, lashes:lashes, lashRGB:lashRGB };

  // 眉（長方形／直線／ギザギザ × 水平／タレ眉／吊り眉）。
  // 既定はキャラごとの eyebrows（faceSpec）、編集ツールで個別に上書き・追加できる
  {
    const defBrow = f.eyebrows;
    const eyebrowShape = pick(G.eyebrowShape, defBrow ? defBrow.shape : null);
    if(eyebrowShape && eyebrowShape!=='none'){
      const eyebrowTilt = pick(G.eyebrowTilt, defBrow ? defBrow.tilt : 'flat');
      const eyebrowRGB  = pick(G.eyebrowRGB,  defBrow ? defBrow.rgb  : [120,120,130]);
      const eyebrowGap  = pick(G.eyebrowGap, 1);
      drawEyebrows(ctx, cx, cy, half, rx, ry, eyebrowShape, eyebrowTilt, eyebrowRGB, eyebrowGap);
    }
  }

  // 8 の∞型マスク（目の後ろ）
  if(f.infinityMask) drawInfinityMask(ctx, cx, cy, half, rx, ry, u);

  // 5：星は「右目（キャラ基準）＝見る側の左目」だけ。両目を覆う一枚星ではない
  if(f.starMask){
    ctx.save();
    starPath(ctx, cx-half, cy, rx*1.48, rx*0.68, 5, -Math.PI/2);
    ctx.fillStyle = rgb(NAVY);
    ctx.strokeStyle = rgba(darken(NAVY,0.35), 0.9);
    ctx.lineWidth = STROKE; ctx.lineJoin = 'round';
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // 10：目は丸いまま、両目の後ろに赤い星の柄（目そのものを星型アイコンにはしない）
  if(f.starBehindEyes){
    ctx.save();
    ctx.fillStyle = rgb(DIGIT_COLORS[1]);
    ctx.strokeStyle = rgba(darken(DIGIT_COLORS[1],0.35), 0.9);
    ctx.lineWidth = STROKE; ctx.lineJoin = 'round';
    for(const s of [-1, 1]){
      starPath(ctx, cx+s*half, cy, rx*1.48, rx*0.68, 5, -Math.PI/2);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // 3 のジェスター帽。目より先に描いて、目が角に隠れないようにする
  if(f.jesterHat) drawJesterHat(ctx, cx, y + bs*0.10, u);

  if(f.eyeCount===1){
    // 単眼（1 と 100）。ブロックの左右センターに置く
    drawEye(ctx, cx, cy, rx, ry, eyeShape, eyeOpts);
  } else {
    // 11の倍数（55除く）は画面左が大きい＝十の位
    const sL = f.asymmetric ? 1.42 : 1.0;
    const sR = f.asymmetric ? 0.72 : 1.0;
    // 5 は「右目が星型」＝キャラ基準の右＝見る側の左だけ星の目にする
    const shL = eyeShape, shR = eyeShape;
    // 瞳を顔の中心寄りにわずかに動かす（左目は+方向、右目は-方向＝内側）。
    // 既定は 7 だけ少し寄る。編集ツールの pupilShift（rx単位）があればそれを使う
    const pupilShift = pick(G.pupilShift, spec.n===7 ? 0.16 : 0) * rx;
    drawEye(ctx, cx-half, cy, rx*sL, ry*sL, shL, Object.assign({}, eyeOpts, {pupilOffsetX: pupilShift}));
    drawEye(ctx, cx+half, cy, rx*sR, ry*sR, shR, Object.assign({}, eyeOpts, {pupilOffsetX: -pupilShift}));
    // 2 の丸メガネ：白目を囲む太い紫のリング＋ブリッジ＋つる
    if(f.roundGlasses){
      ctx.save();
      ctx.strokeStyle = rgb(f.roundGlasses);
      ctx.lineCap = 'round';
      // 枠は縦長の楕円。線は細め
      ctx.lineWidth = rx*0.26;
      for(const ex of [cx-half, cx+half]){
        ctx.beginPath(); ctx.ellipse(ex, cy, rx*1.18, ry*1.14, 0, 0, Math.PI*2); ctx.stroke();
      }
      // ブリッジ・つるは枠より幅広く、水平に伸ばす
      ctx.lineWidth = rx*0.46;
      ctx.beginPath(); ctx.moveTo(cx-half+rx*1.18, cy); ctx.lineTo(cx+half-rx*1.18, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx-half-rx*1.18, cy); ctx.lineTo(cx-half-rx*2.4, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx+half+rx*1.18, cy); ctx.lineTo(cx+half+rx*2.4, cy); ctx.stroke();
      ctx.restore();
    }
    // 26（エージェント）の黒いサングラス。目を覆い隠すので目より後に描く
    if(f.sunglasses) drawSunglasses(ctx, cx, cy, half, rx, ry);
    // 20 の紫のメガネ
    if(f.glasses){
      ctx.save();
      ctx.lineWidth = STROKE*1.4;
      ctx.strokeStyle = rgb([120,60,190]);
      for(const ex of [cx-half, cx+half]){
        ctx.beginPath(); ctx.roundRect(ex-rx*1.45, cy-ry*1.05, rx*2.9, ry*2.1, ry*0.5); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(cx-half+rx*1.45, cy); ctx.lineTo(cx+half-rx*1.45, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx-half-rx*1.45, cy-ry*0.2); ctx.lineTo(cx-half-rx*2.2, cy-ry*0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx+half+rx*1.45, cy-ry*0.2); ctx.lineTo(cx+half+rx*2.2, cy-ry*0.6); ctx.stroke();
      ctx.restore();
    }
  }


  // 3 のジャグリングボール3個（真ん中のブロックに付くボタン）
  // ボタンは「上から2つ目のブロック」の中央にきれいに収める
  if(f.buttons>0) drawButtons(ctx, x+w/2, y + bs*1.5, u, f.buttons);
  // 20 の蝶ネクタイ
  if(f.bowtie) drawBowtie(ctx, cx, cy + u*1.65, u);
  // 7 の7本の虹色の髪
  if(f.hair>0) drawHair(ctx, cx, y + bs*0.05, u, f.hair);
  // 20 のシルクハット
  if(f.tophat) drawTopHat(ctx, cx, y - bs*0.08, w, u, bs);
  // 26（エージェント）の襟＋ネクタイと中折れ帽
  if(f.necktie) drawNecktie(ctx, cx, cy + u*1.55, u);
  if(f.fedora)  drawFedora(ctx, cx, y + bs*0.10, w, u, bs);
}

/**
 * ミニマルな数字の字形。フォントに頼らず自前で描く。
 * 1 は「縦棒だけ」＝上の払い（ヒゲ）もセリフも付けない。
 * 中心 (cx,cy)、高さ h。線は丸い端の太い棒。
 */
function digitPath(ctx, d, cx, cy, h){
  const w = h*0.56, lw = h*0.22;
  const L = cx-w/2, R = cx+w/2, T = cy-h/2, B = cy+h/2, M = cy;
  const rx = (w-lw)/2, ry = (h-lw)/2;
  ctx.beginPath();
  switch(d){
    case '0': ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); break;
    case '1': ctx.moveTo(cx, T); ctx.lineTo(cx, B); break;   // 縦棒だけ
    case '2':
      ctx.moveTo(L, T+h*0.16);
      ctx.quadraticCurveTo(cx, T-h*0.10, R, T+h*0.18);
      ctx.quadraticCurveTo(R+w*0.10, M+h*0.10, L, B);
      ctx.lineTo(R, B);
      break;
    case '3':
      ctx.moveTo(L, T+h*0.10);
      ctx.quadraticCurveTo(R+w*0.30, T-h*0.02, cx+w*0.02, M);
      ctx.quadraticCurveTo(R+w*0.34, B+h*0.02, L, B-h*0.10);
      break;
    case '4':
      ctx.moveTo(R-w*0.16, T); ctx.lineTo(L, M+h*0.14); ctx.lineTo(R, M+h*0.14);
      ctx.moveTo(R-w*0.16, T); ctx.lineTo(R-w*0.16, B);
      break;
    case '5':
      ctx.moveTo(R, T); ctx.lineTo(L, T); ctx.lineTo(L, M-h*0.04);
      ctx.quadraticCurveTo(R+w*0.28, M-h*0.10, cx, B);
      ctx.quadraticCurveTo(L+w*0.10, B+h*0.02, L, B-h*0.16);
      break;
    case '6':
      ctx.moveTo(R-w*0.06, T+h*0.04);
      ctx.quadraticCurveTo(L-w*0.14, T+h*0.30, L, M+h*0.16);
      ctx.quadraticCurveTo(L+w*0.02, B+h*0.12, cx, B);
      ctx.quadraticCurveTo(R+w*0.14, B-h*0.04, cx, M+h*0.06);
      ctx.quadraticCurveTo(L+w*0.06, M+h*0.02, L+w*0.02, M+h*0.22);
      break;
    case '7': ctx.moveTo(L, T); ctx.lineTo(R, T); ctx.lineTo(cx-w*0.10, B); break;
    case '8':
      ctx.ellipse(cx, T+ry*0.62, rx*0.86, ry*0.55, 0, 0, Math.PI*2);
      ctx.moveTo(cx+rx, B-ry*0.55);
      ctx.ellipse(cx, B-ry*0.55, rx, ry*0.58, 0, 0, Math.PI*2);
      break;
    case '9':
      ctx.moveTo(L+w*0.06, B-h*0.04);
      ctx.quadraticCurveTo(R+w*0.14, B-h*0.30, R, M-h*0.16);
      ctx.quadraticCurveTo(R-w*0.02, T-h*0.12, cx, T);
      ctx.quadraticCurveTo(L-w*0.14, T+h*0.04, cx, M-h*0.06);
      ctx.quadraticCurveTo(R-w*0.06, M-h*0.02, R-w*0.02, M-h*0.22);
      break;
  }
}

/** ナンバーリング（ブロックの上に数字が浮かぶ。黒一色・フチなし） */
function drawNumberling(ctx, spec, x, y, bs){
  const w = spec.cols*bs;
  const h = bs*0.55;                 // 高さ＝セル1辺の 0.55倍
  // ブロック上端との間隔。3のジェスター帽・7の髪・20の帽子のぶんは上へ逃がす
  const lift = (spec.n===3 || spec.n===7) ? bs*0.55 : (spec.n===20 ? bs*1.15 : 0);
  const gap = bs*0.15 + lift;
  const str = String(spec.n);
  const gw = h*0.56, sp = h*0.20;    // 字幅と字間
  const totalW = str.length*gw + (str.length-1)*sp;
  const cy = y - gap - h/2;
  ctx.save();
  ctx.lineWidth = h*0.22;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000000';       // 黒一色。白フチは付けない
  for(let i=0;i<str.length;i++){
    const cx = x + w/2 - totalW/2 + gw/2 + i*(gw+sp);
    digitPath(ctx, str[i], cx, cy, h);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * ナンバーブロックを描く。
 * (x,y) はブロック本体の左上。blockSize は1マスの一辺。
 * opts: { t:時刻ms, animate:bool, numberling:bool, spec:再利用するspec }
 */
function drawNumberblock(ctx, n, x, y, blockSize, opts){
  opts = opts||{};
  const spec = opts.spec || blockSpec(n);
  const bs = blockSize;
  const t = opts.t||0;
  setStroke(bs);          // 線幅は1マスの大きさから決まる固定値

  ctx.save();
  ctx.lineCap='round'; ctx.lineJoin='round';

  // 手足（体の後ろ）
  const geo = limbGeometry(spec, x, y, bs, t, !!opts.animate);
  drawLimbs(ctx, spec, geo, bs);

  // ── セルの塗り ──
  for(const c of spec.cells){
    const bx = x + c.gx*bs, by = y + c.gy*bs;
    ctx.fillStyle = rgb(c.colorRGB);
    if(c.isTen || c.isHundred){
      // 十のかたまり／百は継ぎ目なくベタで塗る
      ctx.fillRect(bx, by, bs+0.6, bs+0.6);
    } else {
      // 一の位ブロックは1個ずつ独立したキューブ。角の丸み＝1辺の7%、ベタ塗り。
      // （元画像のアールは控えめ。大きくすると丸いタイルに見えてしまう）
      // 輪郭線を描くのは「10のかたまり／100」を示すときだけ。
      // 一の位のキューブはベタ塗りで、この隙間だけが境目になる。
      const in_ = bs*0.018, r = bs*0.07;
      ctx.beginPath(); ctx.roundRect(bx+in_, by+in_, bs-in_*2, bs-in_*2, r); ctx.fill();
      if(c.isTen || c.isHundred){
        ctx.lineWidth = STROKE;
        ctx.strokeStyle = rgb(c.borderRGB);
        ctx.beginPath(); ctx.roundRect(bx+in_, by+in_, bs-in_*2, bs-in_*2, r); ctx.stroke();
      }
      // 6：各ブロックにサイコロの目（下から1..6）を薄く重ねる
      if(spec.n===6) drawSixPips(ctx, bx, by, bs, 6-c.gy);
    }
  }

  // ── 十のかたまり／百の内部グリッド（1マスの区切りは細く薄く） ──
  ctx.lineWidth = STROKE*0.45;
  ctx.strokeStyle = 'rgba(0,0,0,0.13)';
  ctx.beginPath();
  for(const c of spec.cells){
    if(!(c.isTen||c.isHundred)) continue;
    const bx = x + c.gx*bs, by = y + c.gy*bs;
    ctx.moveTo(bx, by); ctx.lineTo(bx+bs, by); ctx.lineTo(bx+bs, by+bs);
    ctx.lineTo(bx, by+bs); ctx.lineTo(bx, by);
  }
  ctx.stroke();

  // ── グループの外周フチ（ここが見た目の決め手） ──
  for(const g of spec.groups){
    if(g.kind==='one') continue;   // 一の位は上でセル単位に描いた
    const segs = groupOutline(spec.cells, g.cellIndexes);
    ctx.lineWidth = STROKE*2.3;
    ctx.strokeStyle = rgb(g.borderRGB);
    ctx.beginPath();
    for(const s of segs){
      ctx.moveTo(x+s[0]*bs, y+s[1]*bs);
      ctx.lineTo(x+s[2]*bs, y+s[3]*bs);
    }
    ctx.stroke();
  }

  // 顔
  drawFace(ctx, spec, x, y, bs, geo);
  // ナンバーリング
  if(opts.numberling !== false) drawNumberling(ctx, spec, x, y, bs);

  ctx.restore();
  return spec;
}

/* ── 1マス（キューブ）の大きさは全キャラ共通の定数 ──────────────
   Numberblocks の根幹は「1マスの大きさが全員同じ」＝ 100 の面積は 1 の100倍。
   なのでキャラごとに画面へフィットさせる拡縮はしない。
   いちばん大きい 10×10（＝100）が収まるように箱から1回だけ決め、
   その同じ値を 1 にも 100 にも使う。結果 1 は小さな点、100 は画面いっぱいになる。 */
const PAD_X = 1.6, PAD_TOP = 2.0, PAD_BOT = 1.1;   // 手・ナンバーリング・足のぶん
// いちばん大きい外形は 1〜100 を実際に並べて求める（33 は 3×11、72 は 6×12 なので
// 「10×10 が最大」とは限らない）。ここが自動なら並びを変えても破綻しない。
let MAX_COLS = 10, MAX_ROWS = 10;
(function(){
  for(let n=1;n<=100;n++){
    const s = blockSpec(n);
    if(s.cols>MAX_COLS) MAX_COLS = s.cols;
    if(s.rows>MAX_ROWS) MAX_ROWS = s.rows;
  }
})();
function cubeSizeFor(availW, availH){
  return Math.max(2, Math.min(availW/(MAX_COLS + PAD_X*2),
                              availH/(MAX_ROWS + PAD_TOP + PAD_BOT)));
}

/**
 * 箱の中に描く。1マスの大きさは cubeSizeFor で決まる共通定数で、n によらない。
 * 足を共通の床ラインに揃えるので、数が大きいほど背が高く見える。
 */
function drawNumberblockFit(ctx, n, bx, by, bw, bh, opts){
  opts = opts||{};
  const spec = blockSpec(n);
  const bs = opts.cube || cubeSizeFor(bw, bh);   // ← ここがキャラ共通
  const w = spec.cols*bs, h = spec.rows*bs;
  // 横：中央
  const x = bx + (bw - w)/2;
  // 縦：足を共通の床ラインに乗せる（大きさの比較がそのまま身長差になる）
  const floorY = by + bh - PAD_BOT*bs;
  const y = floorY - h;
  opts.spec = spec;
  drawNumberblock(ctx, n, x, y, bs, opts);
  return bs;
}

/* ===================== ENGINE END ===================== */
