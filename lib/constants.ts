// The step ladder that structures the whole app. S0 is the default on create.
export const STATUS = {
  0: { label: "まだ知らない", short: "S0", hint: "これから出会う曲", color: "#6b7280" },
  1: { label: "知ってる", short: "S1", hint: "曲名で存在は分かる", color: "#64748b" },
  2: { label: "ヘッド弾ける", short: "S2", hint: "コード把握・ヘッド演奏可", color: "#0ea5e9" },
  3: { label: "ジャムで使える", short: "S3", hint: "ソロ/コンピングまで", color: "#22c55e" },
} as const;

export type StatusValue = 0 | 1 | 2 | 3;

export const NOTE_TAGS = ["general", "harmony", "melody", "comping", "soloist"] as const;
export type NoteTag = (typeof NOTE_TAGS)[number];

export const NOTE_TAG_LABEL: Record<string, string> = {
  general: "全般",
  harmony: "ハーモニー",
  melody: "メロディ",
  comping: "コンピング",
  soloist: "ソロ",
};

// Common region labels; 'head' is special — it powers the audio drill.
export const REGION_LABELS = ["head", "A", "B", "bridge", "solo", "intro", "outro"] as const;

export const DRILL_MODES = {
  name_to_info: { label: "曲名 → 情報を思い出す", hint: "キー/構成/進行/メロが浮かぶか" },
  audio_to_name: { label: "ヘッドを聴く → 曲名を当てる", hint: "音から曲を特定できるか" },
} as const;

export type DrillMode = keyof typeof DRILL_MODES;
