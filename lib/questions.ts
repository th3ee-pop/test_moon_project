export type ChoiceQuestion = {
  id: string;
  type: "choice";
  title: string;
  hint: string;
  options: string[];
  correctIndex: number;
};

export type MultiQuestion = {
  id: string;
  type: "multi";
  title: string;
  hint: string;
  options: string[];
  correctIndexes: number[];
};

export type OrderQuestion = {
  id: string;
  type: "order";
  title: string;
  hint: string;
  items: string[];
  correctOrder: string[];
};

export type OpenQuestion = {
  id: string;
  type: "open";
  title: string;
  hint: string;
};

export type Question =
  | ChoiceQuestion
  | MultiQuestion
  | OrderQuestion
  | OpenQuestion;

/** 观察台可查看的日期区间：2026-03-19（朔）起连续 40 天，覆盖一个完整朔望周期 */
export const OBSERVE_START = "2026-03-19";
export const OBSERVE_DAYS = 40;

export const QUESTIONS: Question[] = [
  {
    id: "q1_phase_name",
    type: "choice",
    title: "把日期调到 4 月 21 日，此时月亮是什么样子？",
    hint: "先滑动日期条到 4 月 21 日，观察亮面在左边还是右边、亮多少，再选答案。",
    options: [
      "新月（朔）——几乎看不到",
      "蛾眉月——细细一弯，亮面在右侧",
      "上弦月——右半边亮",
      "满月（望）——整个圆面都亮",
      "下弦月——左半边亮",
    ],
    correctIndex: 1,
  },
  {
    id: "q2_cycle",
    type: "choice",
    title: "月相从一次新月到下一次新月，大约需要多久？",
    hint: "在观察台上从 3 月 19 日（新月）慢慢往后拖，数一数隔了多少天又回到新月。",
    options: ["约 7 天", "约 15 天", "约 29.5 天", "约 365 天"],
    correctIndex: 2,
  },
  {
    id: "q3_reason",
    type: "multi",
    title: "月相为什么会不断变化？选出所有正确说法。",
    hint: "想一想：月亮自己会发光吗？我们看到的亮面是哪里来的光？",
    options: [
      "月球绕地球公转，我们看到它被照亮部分的角度在变",
      "月球自己不发光，我们看到的是它反射的太阳光",
      "月球自己会发光，亮面大小在变",
      "地球的影子挡住了月球，所以出现月相变化",
      "太阳照亮月球的一半，但这一半朝向我们的部分一直在变",
    ],
    correctIndexes: [0, 1, 4],
  },
  {
    id: "q4_order",
    type: "order",
    title: "按时间先后顺序排列这四种月相。",
    hint: "点击月相卡片，按出现顺序依次放入 1、2、3、4 号位置。",
    items: ["满月（望）", "新月（朔）", "下弦月", "上弦月"],
    correctOrder: ["新月（朔）", "上弦月", "满月（望）", "下弦月"],
  },
  {
    id: "q5_midautumn",
    type: "choice",
    title: "中秋节（农历八月十五）晚上，我们看到的月相最接近？",
    hint: "农历十五，古人说的“望”，对应哪种月相？",
    options: ["新月（朔）", "上弦月", "满月（望）", "下弦月"],
    correctIndex: 2,
  },
  {
    id: "q6_open",
    type: "open",
    title: "如果连续三个晚上在同一时间观察月亮，你估计会看到什么变化？说说理由。",
    hint: "不用怕写错，写清“位置”或“亮面”和你猜的原因就好。",
  },
];

export const SCORED_QUESTIONS = QUESTIONS.filter(
  (q) => q.type !== "open",
) as Exclude<Question, OpenQuestion>[];

export const TOTAL_SCORED = SCORED_QUESTIONS.length;

export function gradeQuestion(
  q: Question,
  answer: unknown,
): { isCorrect: boolean; normalized: unknown } {
  switch (q.type) {
    case "choice": {
      const idx = typeof answer === "number" ? answer : -1;
      return { isCorrect: idx === q.correctIndex, normalized: idx };
    }
    case "multi": {
      const picked = Array.isArray(answer) ? [...answer].sort() : [];
      const correct = [...q.correctIndexes].sort();
      const isCorrect =
        picked.length === correct.length &&
        picked.every((v, i) => v === correct[i]);
      return { isCorrect, normalized: picked };
    }
    case "order": {
      const arr = Array.isArray(answer) ? (answer as string[]) : [];
      const isCorrect =
        arr.length === q.correctOrder.length &&
        arr.every((v, i) => v === q.correctOrder[i]);
      return { isCorrect, normalized: arr };
    }
    default:
      return { isCorrect: false, normalized: answer ?? null };
  }
}

export function correctAnswerOf(q: Question): unknown {
  switch (q.type) {
    case "choice":
      return q.options[q.correctIndex];
    case "multi":
      return q.correctIndexes.map((i) => q.options[i]);
    case "order":
      return q.correctOrder;
    default:
      return null;
  }
}
