#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE'];
for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name}`);

const archive = '/Users/symphie/Downloads/Yura External Track Archive';
const csvPath = join(archive, 'track-index.csv');
const catalogPath = new URL('../src/assets/catalogs/yura.json', import.meta.url);
const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const scratch = await mkdtemp(join(tmpdir(), 'yura-external-'));
const awsEnv = { ...process.env, AWS_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION: 'auto' };

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift();
  return rows.filter(r => r.some(Boolean)).map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] || ''])));
}

const dates = new Map(Object.entries({
  '最後の女王': '2009-09-02', '東京バベル': '2009-09-02',
  '大阪ソング': '2005-09-20', 'BrokenFrame': '2005-11-11', 'こねこのおさんぽ': '2006-05-25',
  'Magical ゆらンわーるど': '2006-05-29', 'Chant': '2006-08-01', 'Apra la giuntura ～綻び～': '2006-08-01',
  '愛の歌 ～Red Amaryllis～': '2006-09-04', '愛の歌 ～Red Amaryllis～ REMIX': '2006-10-10',
  '陰': '2006-11', '陰 打ち込みver': '2006-11', 'Sweet Snow Story': '2006-12-04',
  'tears (web version)': '2006-04-19', 'ウンディーネの悲劇 short version': '2006-08-16',
  '哀愁姫君': '2008-02-07', '無言峠': '2008-01-13', 'アヒル大作戦のテーマ': '2008-06-18',
  'ナイトクラブ 葉と月': '2007-07', 'Temptation preview': '2007-06',
  '番凩 (歌ってみた)': '2013-09-26',
  'ゆらじお1': '2006-01-14', 'ゆらじお20': '2007-04-18', 'ゆらじお24': '2008-12-25',
  'ゆらじお25': '2010-06', '7月のゆらじお': '2011-07-30', 'たまゆら パンドラ☆ナイト': '2008-10-25',
  'Summer Days': '2007', 'Dance & Chance': '2007', '「だいすき」って気持ち': '2008',
  '「だいすき」って気持ち ～ハワイアンバージョン～': '2008', 'シュガシュガ・マリン・クルージング': '2009',
  'ラブ☆ダッシュ': '2009', 'ミラクルダイブ': '2009', '光さす美らの海': '2009', 'フルスロットル・ラブ': '2010',
  'ラブ☆ダッシュ ≪Remix≫': '2016', 'Dark Testament': '2022-04-28', 'Dark Testament (Short Version)': '2022-04-28',
  'まっかっか': '2022', 'Star Princess - Love Above the Rooftops': '2024-10-24', 'The Cursed Doll': '2024-08-02',
  'Nosferatu': '2024', 'SoulStone -闇喰イサァカス団-': '2025-06-06', '女神な世界 Ⅱ': '2017',
  'いにしえの鐘の音 (Dramatic Ver. by 樋口秀樹)': '2020-12-01', 'Black Swan Lake': '2019-09-05',
  '滲む景色 (Lyrical Ver. by 樋口秀樹)': '2019-03-20', 'endless repeat': '2018-08-10',
  '終焉のセレナーデ': '2018-05-06', "Drivi'n greedy - Nhato Remix -": '2017-12-29',
  '刹那のカーリギッド ～セトリオスの6の赦罪より～': '2017-04-12', 'ふいっち！Do you Love？': '2016-12-22',
  '不思議の国のお姫様': '2016-08-13', 'locus': '2016-05-08', 'Layrinth I - The Green Green Woodlands': '2007-10-08',
  'saMsAra ~Facing the Circle of Life~': '2007-09-30', '夜空に歌う子守唄': '2007-02-14',
  'Color Of Happiness': '2006-08-11', 'Love Flavor': '2006-08-11', 'Rose!Rose!Rose!': '2007-08-17',
  '少女冬恋': '2008-02-14',
  'Caterpillar Song (BOF2010 BMS version)': '2010-09-24', 'Intense desire': '2011-08-02',
  'Sweet Sweet Magic': '2011-12-21', '時の檻': '2011-12-30',
  'フタリゴト': '2011-12-30', 'Colorless night': '2012-08-11', 'Replay&Review': '2012-12-30',
  '夢～KAGEROU～': '2013-08-12', 'Rainy Blue': '2013-12-30', 'Lunicode': '2014-08-16',
  '豊穣弥生': '2014', "vanish out of one's sight": '2014-12-29', 'irreplaceable': '2014-12-29',
  '永遠の水面': '2015-08-14',
  '夢と光': '2015-12-30', 'バタフライディルージョン': '2015-08-14',
  '戒律の炎と蒼星姫': '2010-03-14', 'nothing guilty': '2010-08-14',
  '絶対love×love宣言!! (Brilliant Orange arrange cover)': '2010-05-05',
  'Candid Telling You': '2009-08-15', '幻想の空': '2009-08-15',
  'Divine Memories': '2009-10-11', 'Eternal Wind': '2009-12-30',
  'Act-TWO': '2013-08-12',
  '季節の雫': '2006-12-31', 'Take me high': '2006-08-13', 'Joker': '2009-12-30',
  'Snow Mirage': '2010', 'セレナード': '2025-01-09',
  '天城心中': '2025-02-08', 'ヴェルヴェット・リフレイン': '2025-02-08',
  'Special Colors!!': '2016-08-13', '流れ星に願いを込めて...': '2010-08-14',
  '落葉ぼれろ': '2007-09-30', '花のささやき': '2011-12-30', 'ブルーウォーター': '2011-12-30',
  '迷宮ノ小鳥': '2007-10-08', '愚者転生': '2008-08-01',
  'card format': '2016-12-29', 'Ash and Snow': '2010-12-30', 'Caterpillar Song (extended)': '2012-04-30',
  '東方妖怪小町': '2005-05-04', '恋色マスタースパーク': '2005-05-04',
}));

const artists = new Map(Object.entries({
  'Dance & Chance': '葉月ゆら & ワリン', '光さす美らの海': '葉月ゆら & ワリン',
  'ふいっち！Do you Love？': '葉月ゆら & 安田みずほ',
  'Rose!Rose!Rose!': 'Rin', 'Love Flavor': 'Various Artists', 'Layrinth I - The Green Green Woodlands': 'ARA & 葉月ゆら',
  '夜空に歌う子守唄': '九十九百太郎 feat. 葉月ゆら', '女神な世界 Ⅱ': '葉月ゆら & 翡翠',
  '少女冬恋': 'Drop feat. 葉月ゆら',
  'Caterpillar Song (BOF2010 BMS version)': 'Bitplane feat. 葉月ゆら',
  'Sweet Sweet Magic': '葉月ゆら & 月子',
}));

const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
};
const publicUrl = key => `${process.env.R2_PUBLIC_BASE}/${key.split('/').map(encodeURIComponent).join('/')}`;
const safeName = value => value.replaceAll('/', '／').replaceAll('\\', '＼');
const coverRevisions = new Map([
  ...[
    'Black Swan Lake', 'saMsAra ~Facing the Circle of Life~', '夜空に歌う子守唄',
    'Color Of Happiness', 'Love Flavor', 'Rose!Rose!Rose!', '少女冬恋', 'Intense desire', '時の檻',
  ].map(title => [title, 'clean']),
  ...[
    'endless repeat', '刹那のカーリギッド ～セトリオスの6の赦罪より～',
    'ふいっち！Do you Love？', '夢と光',
  ].map(title => [title, 'clean-v2']),
]);
const encodeMetadata = value => encodeURIComponent(value).replaceAll("'", '%27');
const objectMetadata = row => [
  `title=${encodeMetadata(row.track_name)}`, `category=${encodeMetadata(row.category)}`,
  `credit=${encodeMetadata(row.role)}`, `release=${encodeMetadata(row.release_allocation)}`,
].join(',');

const groupDefinitions = [
  { id: 'kimi-no-iru-keshiki', title: '君のいる景色', year: '2009', date: '2009-09-02',
    cover: 'images/groups/君のいる景色.jpg', tracks: new Set(['最後の女王', '東京バベル']) },
  { id: 'sea-story', title: 'Sea Story compilation album', year: '2007–2010', date: '2010',
    cover: 'images/groups/Sea Story compilation album.jpg', tracks: new Set([
      'Summer Days', 'Dance & Chance', '「だいすき」って気持ち', '「だいすき」って気持ち ～ハワイアンバージョン～',
      'シュガシュガ・マリン・クルージング', 'ラブ☆ダッシュ', 'ミラクルダイブ', '光さす美らの海', 'フルスロットル・ラブ',
    ]) },
  { id: 'memento-mori', title: 'Memento Mori: Lament Collection Vol.1', year: '2022', date: '2022',
    cover: 'images/groups/Memento Mori Lament Collection Vol.1.jpg', tracks: new Set(['まっかっか']) },
  { id: 'cursed-doll', title: 'The Cursed Doll', year: '2024', date: '2024-08-02',
    cover: 'images/groups/The Cursed Doll.jpg', tracks: new Set(['The Cursed Doll']) },
  { id: 'taiko', title: 'Taiko no Tatsujin Collection', year: '2011–2025', date: '2025-06-06',
    cover: 'images/groups/Taiko no Tatsujin Collection.jpg', match: row =>
      row.category.includes('太鼓の達人') || row.release_allocation.includes('Taiko no Tatsujin') },
  { id: 'dark-testament', title: 'Escu:de BEST VOCAL on PEACH', year: '2023', date: '2023-11-24',
    cover: 'images/groups/Dark Testament.jpg', tracks: new Set(['Dark Testament', 'Dark Testament (Short Version)']) },
  { id: 'geheime-musikbuch', title: 'Geheime Musikbuch: Himitsu no Ongakujou', year: '2020', date: '2020-12-01',
    cover: 'images/groups/Geheime Musikbuch - Himitsu no Ongakujou.jpg',
    tracks: new Set(['いにしえの鐘の音 (Dramatic Ver. by 樋口秀樹)']) },
  { id: 'yura-radio', title: 'Yura Radio', year: '2006–2011', date: '2006-01-14',
    cover: 'images/groups/Unknown Archive.jpg', tracks: new Set([
      'ゆらじお1', 'ゆらじお20', 'ゆらじお22', 'ゆらじお24', 'ゆらじお25',
      '7月のゆらじお', 'nyurajio', 'たまゆら パンドラ☆ナイト',
    ]) },
  { id: 'unknown-archive', title: 'Unknown Archive', year: '2006–2011', date: '2011-07-30',
    cover: 'images/groups/Unknown Archive.jpg', tracks: new Set([
      'Rose Tattoo',
    ]), match: row => row.category === 'Web single / archival recovery' },
];

const explicitGroup = row => groupDefinitions.find(group => group.tracks?.has(row.track_name) || group.match?.(row));

function releaseTitle(row) {
  const grouped = explicitGroup(row);
  if (grouped) return grouped.title;
  const allocation = row.release_allocation;
  if (allocation === 'Unknown') return row.track_name;
  const exact = new Map(Object.entries({
    'ライザのアトリエ2 arrangement soundtrack': 'Geheime Musikbuch: Himitsu no Ongakujou',
    'Unknown / soundtrack allocation pending': 'Atelier Lulua Arland Arrange CD',
    'CHUNITHM AMAZON': 'Black Swan Lake',
    'REFLEC BEAT 悠久のリフレシア': 'REFLEC BEAT THE REFLESIA OF ETERNITY + REFLEC BEAT VOLZZA ORIGINAL SOUNDTRACK',
    '残念な姉との幸福論 OP / LBOS-001': '残念な姉とのラブコメディ Original Soundtrack',
    'THE BMS OF FIGHTERS 2010 entry 196': 'THE BMS OF FIGHTERS 2010',
  }));
  if (exact.has(allocation)) return exact.get(allocation);
  const patterns = [
    [/^EastNewSound (.+?) ENS-\d+.*$/, '$1'], [/^ESQUARIA (.+?) EQ(?:CD)?-\d+.*$/, '$1'],
    [/^TatshMusicCircle (.+?) TMCCD-\d+.*$/, '$1'], [/^the forget-me-not (.+?) YMCD-\d+.*$/, '$1'],
    [/^stretta di mano (.+?) SDM-\d+.*$/, '$1'], [/^Plutinum Crest powered by Silver Forest (.+?) PTCR\d+.*$/, '$1'],
    [/^少女病 (.+?) GIRL-\d+.*$/, '$1'], [/^(Winter Mix vol\.\d+).*$/, '$1'],
    [/^IOSYS (.+?) IO-\d+.*$/, '$1'], [/^こなぐすり (.+?) CNCD-\d+.*$/, '$1'],
    [/^(R\.U\.R\.U\.R Original Sound Track).*$/, '$1'], [/^(Yggdrasill Leaf).*$/, '$1'], [/^(Claymore).*$/, '$1'],
  ];
  for (const [pattern, replacement] of patterns) if (pattern.test(allocation)) return allocation.replace(pattern, replacement);
  return allocation.replace(/\s+(?:track|disc)\s+\d+.*$/i, '').replace(/\s+[A-Z]{2,}-\d+(?:~\d+)?(?:\s+.*)?$/, '').trim();
}

const rows = parseCsv(await readFile(csvPath, 'utf8'));
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
catalog.albums = catalog.albums.filter(item => !item.standalone_single && !item.virtual_single && !item.external_archive);

try {
  const prepared = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const number = String(index + 1).padStart(3, '0');
    const title = row.track_name;
    const artist = artists.get(title) || '葉月ゆら';
    const date = dates.get(title) || '';
    const year = date.slice(0, 4) || 'Unknown';
    const sourceAlbum = releaseTitle(row);
    const sourceAudio = join(archive, row.audio_file);
    const sourceCover = join(archive, row.image_file);
    const taggedAudio = join(scratch, `${number}.mp3`);
    const audioKey = `singles/${number} ${safeName(title)}.mp3`;
    const coverRevision = coverRevisions.get(title);
    const coverKey = `covers/singles/${number} ${safeName(title)}${coverRevision ? ` [${coverRevision}]` : ''}.jpg`;

    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourceAudio, '-map', '0:a:0', '-vn', '-codec:a', 'copy',
      '-id3v2_version', '3', '-metadata', `title=${title}`, '-metadata', `artist=${artist}`,
      '-metadata', `album=${sourceAlbum}`, '-metadata', `date=${year}`,
      '-metadata', `comment=葉月ゆら credit: ${row.role}`, taggedAudio]);
    const duration = Math.round(Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', taggedAudio])));
    const bitrate = Number(run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=bit_rate',
      '-of', 'default=noprint_wrappers=1:nokey=1', taggedAudio]));
    if (!Number.isFinite(bitrate) || bitrate > 129000) throw new Error(`Unexpected bitrate ${bitrate}: ${title}`);

    run('aws', ['s3api', 'put-object', '--endpoint-url', endpoint, '--bucket', process.env.R2_BUCKET,
      '--key', audioKey, '--body', taggedAudio, '--content-type', 'audio/mpeg', '--metadata', objectMetadata(row),
      '--cache-control', 'public, max-age=31536000, immutable'], awsEnv);
    run('aws', ['s3api', 'put-object', '--endpoint-url', endpoint, '--bucket', process.env.R2_BUCKET,
      '--key', coverKey, '--body', sourceCover, '--content-type', 'image/jpeg',
      '--cache-control', 'public, max-age=31536000, immutable'], awsEnv);

    prepared.push({ row, title, artist, date, year, sourceAlbum, audioKey, coverKey, duration });
    console.log(`${index + 1}/${rows.length} ${title} · ${Math.round(bitrate / 1000)} kbps`);
  }

  const groups = new Map();
  for (const item of prepared) {
    const definition = explicitGroup(item.row);
    const key = definition?.id || `release:${item.sourceAlbum}`;
    if (!groups.has(key)) groups.set(key, { definition, title: item.sourceAlbum, items: [] });
    groups.get(key).items.push(item);
  }

  for (const group of groups.values()) {
    const first = group.items[0];
    let coverKey = first.coverKey;
    if (group.definition?.cover) {
      coverKey = `covers/others/${safeName(group.title)}.jpg`;
      run('aws', ['s3api', 'put-object', '--endpoint-url', endpoint, '--bucket', process.env.R2_BUCKET,
        '--key', coverKey, '--body', join(archive, group.definition.cover), '--content-type', 'image/jpeg',
        '--cache-control', 'public, max-age=31536000, immutable'], awsEnv);
    }
    const date = group.definition?.date || group.items.map(item => item.date).filter(Boolean).sort()[0] || '';
    const year = group.definition?.year || date.slice(0, 4) || first.year;
    catalog.albums.push({ album: group.title, title: group.title, artist: '葉月ゆら', year, date,
      category: group.items.length > 1 ? 'External collection' : first.row.category,
      verification_status: 'Release-level archive grouping; per-track credits and provenance are retained in the acquisition index.',
      source_url: first.row.source_url, cover: coverKey, cover_url: publicUrl(coverKey),
      release_types: ['others'], external_archive: true,
      tracks: group.items.map((item, index) => ({ track: String(index + 1).padStart(2, '0'), title: item.title,
        artist: item.artist, instrumental: false, file: item.audioKey, url: publicUrl(item.audioKey),
        dur: item.duration, genres: [item.row.category], credit: item.row.role })) });
  }

  catalog.release_counts.singles = 0;
  catalog.release_counts.others = catalog.albums.filter(a => (a.release_types || []).includes('others')).length;
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
