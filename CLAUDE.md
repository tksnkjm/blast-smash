# BLAST SMASH — 開発ドキュメント

## プロジェクト概要
スマッシュブラザーズ風の4人対戦ゲーム。  
スマホブラウザで動作。Firebase Realtime Database を使った合言葉マッチング。

## セットアップ

### 1. Firebase プロジェクト作成
1. https://console.firebase.google.com/ でプロジェクトを作成
2. Realtime Database を有効化（「テストモード」で開始可）
3. プロジェクト設定 → ウェブアプリを追加 → SDK 設定を取得

### 2. Firebase 設定
`docs/js/constants.js` の `FIREBASE_CONFIG` を自分のプロジェクトの値で書き換える：

```javascript
const FIREBASE_CONFIG = {
  apiKey:            'xxx',
  authDomain:        'your-project.firebaseapp.com',
  databaseURL:       'https://your-project-default-rtdb.firebaseio.com',
  projectId:         'your-project',
  storageBucket:     'your-project.appspot.com',
  messagingSenderId: '000000',
  appId:             '1:000:web:xxx'
};
```

### 3. Database セキュリティルール
Firebase Console → Realtime Database → ルール で以下を設定：

```json
{
  "rules": {
    "rooms": {
      "$keyword": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

### 4. デプロイ
`docs/` ディレクトリを GitHub Pages や任意の Web サーバーで配信。

---

## ファイル構成

| ファイル | 責務 |
|---|---|
| `docs/js/constants.js` | 純粋定数・Firebase設定 |
| `docs/js/audio.js` | Web Audio API サウンド |
| `docs/js/state.js` | ミュータブル変数の宣言 |
| `docs/js/render.js` | Canvas 描画関数のみ (`draw*` / `render*`) |
| `docs/js/game.js` | Canvas初期化・入力・物理・ゲームループ |
| `docs/js/firebase.js` | Firebase接続・マッチメイキング・同期 |

読み込み順（厳守）: `constants → audio → state → render → game → firebase`

---

## アーキテクチャ

### ホスト権威型同期
- ルームに最初に入ったプレイヤーが「ホスト」
- ホストが全プレイヤーのゲーム状態を計算・管理
- ホストは 20Hz (50ms) で Firebase に `gameState` を書き込む
- クライアントは Firebase の `gameState` をリッスンして描画
- クライアントは 30Hz (33ms) で自分の入力を Firebase に書き込む
- ホストが切断された場合は次のプレイヤーにホスト権が移譲される

### Firebase データ構造
```
/rooms/{keyword}/
  status:    'waiting' | 'playing' | 'finished'
  host:      playerId
  keyword:   string
  createdAt: timestamp
  players/{playerId}: { nick, slot, charIndex, ready }
  inputs/{playerId}:  { left, right, jump, attack, special, jumpSeq, attackSeq, specialSeq }
  gameState: { frame, status, winner, countdown, slots:[...] }
```

---

## ゲームメカニクス

| 要素 | 内容 |
|---|---|
| ストック制 | 各プレイヤー3ストック |
| ダメージ% | 蓄積で吹き飛び量が増加 |
| ブラストゾーン | 画面外に出るとストック-1 |
| 通常攻撃 (ATK) | 前方スラッシュ・7% |
| 必殺技 (SPEC) | 大爆発・13%・ノックバック大 |
| 2段ジャンプ | 空中でもう1回ジャンプ可能 |
| リスポーン | ストック消費後、無敵時間あり |

## キャラクター

| 名前 | 特徴 |
|---|---|
| FIGHTER ⚔️ | バランス型 |
| SPEEDER 💨 | 高速・軽量 |
| HEAVY 🛡️ | 重量・低速・吹き飛びにくい |
| TRICKSTER ⭐ | 素早く跳躍力が高い |

---

## バージョン履歴

| バージョン | 内容 |
|---|---|
| 1.0.0 | 初期リリース — Firebase マッチメイキング + 4人対戦 |
