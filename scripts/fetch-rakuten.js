/**
 * 楽天市場商品検索APIを使って、釣りタックルナビの商品に対応する
 * 楽天の正式な商品名・画像・価格・アフィリエイトURLを取得し、
 * rakuten_products.json に保存するローカル実行専用スクリプト。
 *
 * このスクリプトはローカルPC上でのみ実行する。GitHub Pages側（ブラウザ）は
 * このスクリプトも .env も一切参照せず、生成された rakuten_products.json を
 * 読むだけなので、APIキーがブラウザに渡ることはない。
 *
 * 使い方:
 *   node scripts/fetch-rakuten.js <productId>   … 商品1件だけ取得(候補を手動選択)
 *   node scripts/fetch-rakuten.js --all         … 未取得の全商品を順番に処理
 *   node scripts/fetch-rakuten.js --all --force … 取得済みの商品も含めて全件やり直し
 *   node scripts/fetch-rakuten.js --list        … 商品ID一覧を表示するだけ
 *   node scripts/fetch-rakuten.js --dump <出力先.json> <id1> <id2> ...
 *       … 対話なしで各IDの検索候補(上位5件)をJSONに書き出すだけ。
 *         rakuten_products.json への保存は行わない。候補を人間側で確認してから
 *         別途 --apply で反映するための下調べ用モード。
 *   node scripts/fetch-rakuten.js --apply <選択.json>
 *       … { "productId": 選択したい候補のindex(1始まり) } の形式のJSONを読み、
 *         対応する --dump 済み候補から rakuten_products.json に反映する。
 *         選択JSONには "_dumpFile" キーで --dump の出力先パスを指定する。
 */

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');

const ROOT_DIR = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const HTML_PATH = path.join(ROOT_DIR, '釣りタックルナビ.html');
const JSON_PATH = path.join(ROOT_DIR, 'rakuten_products.json');

// 楽天デベロッパーズでこのApplication IDに「許可されたWebサイト」として
// 登録済みのドメイン。新APIはこれと一致するReferer/Originがないと403になる。
// (このドメイン自体は秘密情報ではない)
const ALLOWED_REFERRER = 'https://fishangler-hub.github.io/';
const ALLOWED_ORIGIN = 'https://fishangler-hub.github.io';

const API_ENDPOINT = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';

const MAKER_JA = { DAIWA: 'ダイワ', SHIMANO: 'シマノ' };

function loadEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^["']|["']$/g, '');
    env[key] = value;
  }
  return env;
}

function extractProducts(htmlPath) {
  const content = fs.readFileSync(htmlPath, 'utf8');
  const pattern = /\{\s*id:"([a-z_0-9]+)",\s*category:"([a-z]+)",\s*maker:"([^"]*)",\s*brand:"([^"]*)",\s*name:"([^"]*)",\s*model:"([^"]*)",\s*specSummary:"([^"]*)"/g;
  const products = [];
  let m;
  while ((m = pattern.exec(content)) !== null) {
    products.push({
      id: m[1],
      category: m[2],
      maker: m[3],
      brand: m[4],
      name: m[5],
      model: m[6],
      specSummary: m[7],
    });
  }
  return products;
}

function buildSearchKeyword(product) {
  const makerJa = MAKER_JA[product.maker] || product.maker || '';
  const parts = [makerJa, product.name, product.model].filter(Boolean);
  return parts.join(' ');
}

function loadJsonStore(jsonPath) {
  if (!fs.existsSync(jsonPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch {
    console.warn(`[警告] ${jsonPath} の読み込みに失敗しました。空の状態から始めます。`);
    return {};
  }
}

function saveJsonStore(jsonPath, data) {
  const sorted = {};
  for (const key of Object.keys(data).sort()) sorted[key] = data[key];
  fs.writeFileSync(jsonPath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
}

async function searchRakuten(env, keyword) {
  const url = new URL(API_ENDPOINT);
  url.searchParams.set('format', 'json');
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('applicationId', env.RAKUTEN_APPLICATION_ID || '');
  url.searchParams.set('accessKey', env.RAKUTEN_ACCESS_KEY || '');
  if (env.RAKUTEN_AFFILIATE_ID) url.searchParams.set('affiliateId', env.RAKUTEN_AFFILIATE_ID);
  url.searchParams.set('hits', '10');

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Referer: ALLOWED_REFERRER,
      Origin: ALLOWED_ORIGIN,
    },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = (body && (body.error_description || (body.errors && body.errors.errorMessage))) || `HTTP ${res.status}`;
    throw new Error(message);
  }
  if (!body) throw new Error('レスポンスの解析に失敗しました');

  return (body.Items || []).map((wrapped) => wrapped.Item);
}

function printCandidates(items) {
  items.forEach((item, i) => {
    const price = typeof item.itemPrice === 'number' ? `¥${item.itemPrice.toLocaleString()}` : '価格不明';
    console.log(`  [${i + 1}] ${item.itemName}`);
    console.log(`       ${price} / ${item.shopName}`);
  });
  console.log('  [0] 該当なし（スキップ）');
}

function toRecord(product, keyword, item) {
  const image =
    (item.mediumImageUrls && item.mediumImageUrls[0] && item.mediumImageUrls[0].imageUrl) ||
    (item.smallImageUrls && item.smallImageUrls[0] && item.smallImageUrls[0].imageUrl) ||
    '';
  return {
    productId: product.id,
    searchName: keyword,
    rakutenProductName: item.itemName || '',
    rakutenImageUrl: image,
    rakutenProductUrl: item.itemUrl || '',
    rakutenAffiliateUrl: item.affiliateUrl || item.itemUrl || '',
    rakutenPrice: typeof item.itemPrice === 'number' ? item.itemPrice : null,
    rakutenFetchedAt: new Date().toISOString(),
  };
}

async function processProduct(env, rl, product, store, keywordOverride) {
  const keyword = keywordOverride || buildSearchKeyword(product);
  console.log(`\n=== ${product.id} ===`);
  console.log(`検索キーワード: ${keyword}`);

  let items;
  try {
    items = await searchRakuten(env, keyword);
  } catch (err) {
    console.log(`  [エラー] 楽天APIの呼び出しに失敗しました: ${err.message}`);
    return false;
  }

  if (!items.length) {
    console.log('  該当する商品が見つかりませんでした。スキップします。');
    return false;
  }

  const shown = items.slice(0, 5);
  printCandidates(shown);

  let answer = '';
  try {
    answer = (await rl.question('採用する商品の番号を入力してください（Enterでスキップ）: ')).trim();
  } catch (err) {
    if (err.code === 'ERR_USE_AFTER_CLOSE') {
      console.log('  (入力を受け付けられなかったためスキップしました)');
      return false;
    }
    throw err;
  }
  const index = Number.parseInt(answer, 10);

  if (!answer || Number.isNaN(index) || index === 0) {
    console.log('  スキップしました。');
    return false;
  }
  if (index < 1 || index > shown.length) {
    console.log('  無効な番号のためスキップしました。');
    return false;
  }

  const chosen = shown[index - 1];
  store[product.id] = toRecord(product, keyword, chosen);
  saveJsonStore(JSON_PATH, store);
  console.log(`  採用: ${chosen.itemName}`);
  console.log(`  rakuten_products.json に保存しました。`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const env = loadEnv(ENV_PATH);

  if (!env.RAKUTEN_APPLICATION_ID || !env.RAKUTEN_ACCESS_KEY) {
    console.error('[エラー] .env に RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY が設定されていません。');
    process.exitCode = 1;
    return;
  }

  const products = extractProducts(HTML_PATH);
  const store = loadJsonStore(JSON_PATH);

  if (args.includes('--list')) {
    products.forEach((p) => console.log(`${p.id}\t${MAKER_JA[p.maker] || p.maker} ${p.name} ${p.model}`.trim()));
    console.log(`\n合計 ${products.length} 件`);
    return;
  }

  if (args.length === 0) {
    console.log('使い方:');
    console.log('  node scripts/fetch-rakuten.js <productId>                  … 商品1件だけ取得');
    console.log('  node scripts/fetch-rakuten.js <productId> --keyword "..."  … 検索キーワードを手動指定して取得');
    console.log('  node scripts/fetch-rakuten.js --all                       … 未取得の全商品を処理');
    console.log('  node scripts/fetch-rakuten.js --all --force               … 取得済みも含めて全件やり直し');
    console.log('  node scripts/fetch-rakuten.js --list                      … 商品ID一覧を表示');
    return;
  }

  if (args.includes('--dump')) {
    const dumpIndex = args.indexOf('--dump');
    const outputPath = args[dumpIndex + 1];
    const ids = args.slice(dumpIndex + 2);
    if (!outputPath || ids.length === 0) {
      console.error('[エラー] 使い方: --dump <出力先.json> <id1> <id2> ...');
      process.exitCode = 1;
      return;
    }
    const result = {};
    let i = 0;
    for (const rawId of ids) {
      const sepIndex = rawId.indexOf('::');
      const id = sepIndex === -1 ? rawId : rawId.slice(0, sepIndex);
      const keywordOverride2 = sepIndex === -1 ? undefined : rawId.slice(sepIndex + 2);
      const product = products.find((p) => p.id === id);
      if (!product) {
        console.log(`[スキップ] 商品ID "${id}" が見つかりません`);
        continue;
      }
      const keyword = keywordOverride2 || buildSearchKeyword(product);
      console.log(`[${++i}/${ids.length}] ${id} … "${keyword}"`);
      try {
        const items = await searchRakuten(env, keyword);
        result[id] = {
          keyword,
          candidates: items.slice(0, 5).map((item) => ({
            itemName: item.itemName || '',
            itemPrice: item.itemPrice,
            shopName: item.shopName || '',
            itemUrl: item.itemUrl || '',
            affiliateUrl: item.affiliateUrl || item.itemUrl || '',
            image:
              (item.mediumImageUrls && item.mediumImageUrls[0] && item.mediumImageUrls[0].imageUrl) ||
              (item.smallImageUrls && item.smallImageUrls[0] && item.smallImageUrls[0].imageUrl) ||
              '',
          })),
        };
      } catch (err) {
        console.log(`  [エラー] ${err.message}`);
        result[id] = { keyword, candidates: [], error: err.message };
      }
      if (i < ids.length) await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
    console.log(`\n${Object.keys(result).length} 件の候補を ${outputPath} に書き出しました。`);
    return;
  }

  if (args.includes('--apply')) {
    const applyIndex = args.indexOf('--apply');
    const selectionPath = args[applyIndex + 1];
    if (!selectionPath || !fs.existsSync(selectionPath)) {
      console.error('[エラー] 選択JSONファイルが見つかりません。');
      process.exitCode = 1;
      return;
    }
    const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
    const dumpFile = selection._dumpFile;
    if (!dumpFile || !fs.existsSync(dumpFile)) {
      console.error('[エラー] 選択JSONの "_dumpFile" が指す --dump 出力ファイルが見つかりません。');
      process.exitCode = 1;
      return;
    }
    const dump = JSON.parse(fs.readFileSync(dumpFile, 'utf8'));
    let applied = 0;
    for (const [id, indexRaw] of Object.entries(selection)) {
      if (id === '_dumpFile') continue;
      const index = Number(indexRaw);
      const entry = dump[id];
      if (!entry || !entry.candidates || !entry.candidates[index - 1]) {
        console.log(`[スキップ] ${id}: 候補 index=${indexRaw} が見つかりません`);
        continue;
      }
      const chosen = entry.candidates[index - 1];
      const product = products.find((p) => p.id === id);
      store[id] = {
        productId: id,
        searchName: entry.keyword,
        rakutenProductName: chosen.itemName,
        rakutenImageUrl: chosen.image,
        rakutenProductUrl: chosen.itemUrl,
        rakutenAffiliateUrl: chosen.affiliateUrl,
        rakutenPrice: typeof chosen.itemPrice === 'number' ? chosen.itemPrice : null,
        rakutenFetchedAt: new Date().toISOString(),
      };
      applied++;
      console.log(`[反映] ${id} ← ${chosen.itemName}`);
    }
    saveJsonStore(JSON_PATH, store);
    console.log(`\n${applied} 件を rakuten_products.json に反映しました。`);
    return;
  }

  const keywordIndex = args.indexOf('--keyword');
  const keywordOverride = keywordIndex !== -1 ? args[keywordIndex + 1] : undefined;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    if (args.includes('--all')) {
      const force = args.includes('--force');
      const targets = products.filter((p) => force || !store[p.id]);
      console.log(`対象: ${targets.length} 件 / 全 ${products.length} 件${force ? '（強制再取得）' : '（未取得分のみ）'}`);

      let done = 0;
      for (const product of targets) {
        await processProduct(env, rl, product, store);
        done++;
        if (done < targets.length) {
          await new Promise((resolve) => setTimeout(resolve, 1200)); // レート制限対策
        }
      }
      console.log(`\n完了: ${done} 件処理しました。`);
      return;
    }

    const targetId = args[0];
    const product = products.find((p) => p.id === targetId);
    if (!product) {
      console.error(`[エラー] 商品ID "${targetId}" が見つかりません。--list で一覧を確認してください。`);
      process.exitCode = 1;
      return;
    }
    await processProduct(env, rl, product, store, keywordOverride);
  } finally {
    rl.close();
  }
}

main();
