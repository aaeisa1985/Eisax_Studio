import type {
  AIProvider,
  EditInput,
  GenerateInput,
  Outline,
  OutlineBlock,
  OutlineSlide,
} from "./types";

const DEFAULT_SLIDE_COUNT: Record<GenerateInput["length"], number> = {
  short: 3,
  medium: 5,
  long: 8,
};

type DomainKind = "investor" | "report" | "educational" | "product";

interface BlueprintChart {
  kind: "bar" | "line" | "pie";
  titleEn: string;
  titleAr: string;
  categoriesEn: string[];
  categoriesAr: string[];
  values: number[];
  unit?: string;
}

interface SlideBlueprint {
  titleEn: string;
  titleAr: string;
  subtitleEn: string;
  subtitleAr: string;
  bulletsEn: string[];
  bulletsAr: string[];
  layout: "title" | "title-body" | "two-col" | "quote";
  accentShape: "none" | "bar" | "card" | "badge";
  notesEn: string;
  notesAr: string;
  chart?: BlueprintChart;
}

function parseExplicitSlideCount(prompt: string, fallback: number): number {
  const enMatch = prompt.match(/\b(\d{1,2})\s*[-–]?\s*slides?\b/i);
  const arMatch = prompt.match(/(\d{1,2})\s*(?:شرائح|شريحة)/);
  const raw = enMatch?.[1] ?? arMatch?.[1];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(15, Math.max(2, n));
}

function detectDomain(prompt: string): DomainKind {
  if (
    /\b(investor|pitch|seed|series\s*[abc]|fundraising|venture|vc|valuation|startup|tam|arr)\b|مستثمرين|استثمار|تمويل|ناشئة/i.test(
      prompt,
    )
  ) {
    return "investor";
  }
  if (
    /\b(report|q[1-4]|quarterly|annual|review|audit|kpi|board|financial|metrics|performance)\b|تقرير|ربع سنوي|أداء|مالي/i.test(
      prompt,
    )
  ) {
    return "report";
  }
  if (
    /\b(student|students|course|lesson|lecture|school|university|learn|tutorial|guide|training)\b|طلاب|تعليم|درس|دورة|شرح/i.test(
      prompt,
    )
  ) {
    return "educational";
  }
  return "product";
}

function detectCharts(prompt: string, domain: DomainKind): boolean {
  if (
    /\b(chart|charts|graph|graphs|kpi|kpis|metrics|data|visuals|revenue|growth|financial)\b|رسوم|بيانية|مؤشرات|أرقام/i.test(
      prompt,
    )
  ) {
    return true;
  }
  return domain === "investor" || domain === "report";
}

function detectBilingual(prompt: string): boolean {
  return /\b(bilingual|arabic\s*(?:&|and)\s*english|english\s*(?:&|and)\s*arabic|en\/ar|ar\/en|dual[- ]language)\b|ثنائي اللغة|عربي وإنجليزي/i.test(
    prompt,
  );
}

function extractSubject(prompt: string): string {
  const cleaned = prompt
    .replace(/\s+/g, " ")
    .trim()
    .replace(/,\s*(with|including|featuring|in)\b.*$/i, "")
    .replace(
      /\b(?:with charts?|and charts?|bilingual|with visuals?|with metrics|in arabic|in english)\b.*$/i,
      "",
    )
    .replace(
      /^(?:create|build|make|design|generate|write|prepare|draft)\s+(?:a|an|the)?\s*/i,
      "",
    )
    .replace(
      /^(?:premium|executive|professional|modern|detailed|comprehensive|compelling|clean)\s+/i,
      "",
    )
    .replace(/^\d{1,2}\s*[-–]?\s*slides?\s+/i, "")
    .replace(
      /^(?:investor\s+pitch\s+deck|investor\s+presentation|pitch\s+deck|presentation|slide\s+deck|deck|document|report|overview)\s+(?:for|about|on|of)\s+/i,
      "",
    )
    .replace(/^(?:أنشئ|صمم|اكتب|أعد)\s+(?:عرض(?:\s+تقديمي)?|مستند|تقرير)\s+(?:لـ|عن|حول)?\s*/i, "")
    .replace(/[.,;:!?]+$/, "")
    .trim();

  if (!cleaned) {
    return prompt.replace(/\s+/g, " ").trim().slice(0, 64) || "Project Overview";
  }
  return cleaned.length > 72 ? cleaned.slice(0, 72).trim() : cleaned;
}

function buildInvestorBlueprints(subject: string, audience: string): SlideBlueprint[] {
  return [
    {
      titleEn: `${subject}: Redefining Bilingual Intelligence`,
      titleAr: `${subject}: إعادة تعريف الذكاء التشغيلي ثنائي اللغة`,
      subtitleEn: `Investor Presentation · ${audience || "Institutional & Seed Partners"}`,
      subtitleAr: `عرض استثماري تنفيذي · ${audience || "شركاء الاستثمار والنمو"}`,
      bulletsEn: [
        `${subject} unifies bilingual EN/AR workflows, document automation, and export-ready analytics`,
        "Built for enterprise teams across MENA and global growth markets",
      ],
      bulletsAr: [
        `تجمع منصة ${subject} بين العمل ثنائي اللغة وإنتاج العروض والتقارير بدقة مؤسسية`,
        "مصممة لفرق الشركات والمؤسسات في الشرق الأوسط والأسواق العالمية",
      ],
      layout: "title",
      accentShape: "badge",
      notesEn: `Open with ${subject}'s core thesis: why bilingual automation and instant executive deliverables win budget now.`,
      notesAr: `ابدأ بعرض الرؤية الأساسية لمنصة ${subject} ولماذا تحل فجوة حقيقية في السوق.`,
    },
    {
      titleEn: "Executive Summary",
      titleAr: "الملخص التنفيذي",
      subtitleEn: `Why ${subject} is poised to lead enterprise productivity`,
      subtitleAr: `لماذا تقود ${subject} موجة الإنتاجية المؤسسية القادمة`,
      bulletsEn: [
        "Unified workspace turning raw prompts and operational data into board-ready PPTX and DOCX",
        "Native right-to-left (RTL) Arabic and LTR English typography on the same canvas",
        "Strong early pull from consulting, finance, and government transformation teams",
        "Capital-efficient GTM with expanding net dollar retention across active seats",
      ],
      bulletsAr: [
        "بيئة عمل موحدة تحول البيانات والأفكار إلى عروض ومستندات جاهزة للتصدير",
        "دعم أصيل لاتجاه الكتابة من اليمين لليسار ومن اليسار لليمين في نفس الشريحة",
        "تبنٍ متسارع من فرق الاستشارات والمالية ومشاريع التحول الرقمي",
        "كفاءة رأسمالية عالية مع توسع الإيرادات المتكررة لكل عميل",
      ],
      layout: "two-col",
      accentShape: "bar",
      notesEn: "Summarize traction, defensibility, and the immediate inflection point.",
      notesAr: "لخص أبرز مؤشرات النمو وميزة المنتج التنافسية.",
    },
    {
      titleEn: "The Market Problem",
      titleAr: "التحدي القائم في السوق",
      subtitleEn: "Manual deck & document production drains executive hours every week",
      subtitleAr: "إعداد العروض والتقارير يدوياً يستنزف ساعات الفرق القيادية أسبوعياً",
      bulletsEn: [
        "Knowledge teams spend 6–10 hours per deliverable reformatting slides, charts, and tables",
        "Generic global tools break Arabic RTL alignment, font hierarchy, and mixed-script numbers",
        "Static exports create version chaos between analyst spreadsheets and board presentations",
      ],
      bulletsAr: [
        "تستغرق الفرق من 6 إلى 10 ساعات لإعداد وتنسيق كل عرض أو تقرير تنفيذي",
        "الأدوات العالمية التقليدية تفشل في تنسيق العربية مع الإنجليزية والأرقام",
        "التصدير الثابت يؤدي لتضارب الإصدارات بين الجداول المالية والشرائح",
      ],
      layout: "title-body",
      accentShape: "card",
      notesEn: "Quantify the wasted hours and broken RTL experience with a real customer anecdote.",
      notesAr: "وضح حجم الوقت الضائع ومشكلة التنسيق ثنائي اللغة بمثال عملي.",
    },
    {
      titleEn: `The ${subject} Solution`,
      titleAr: `الحل الذي تقدمه ${subject}`,
      subtitleEn: "Prompt-to-deliverable studio with native OOXML export",
      subtitleAr: "استوديو متكامل يحوّل الفكرة إلى مخرجات قابلة للتعديل والتصدير",
      bulletsEn: [
        "Structured outline synthesis paired with live canvas editing and reusable themes",
        "Editable native PowerPoint charts & formatted Word tables—not flat screenshots",
        "Role-scoped asset storage, speaker notes, and print-ready PDF pipelines built in",
      ],
      bulletsAr: [
        "توليد هيكلي ذكي مقترن بمحرر مرن وقوالب احترافية متعددة",
        "رسوم بيانية أصلية قابلة للتعديل داخل PowerPoint وجداول منسقة في Word",
        "إدارة آمنة للأصول والصور وملاحظات المتحدث وتصدير PDF مباشر",
      ],
      layout: "two-col",
      accentShape: "bar",
      notesEn: "Emphasize editable native charts and zero layout breakage between web and Office.",
      notesAr: "ركز على أن المخرجات قابلة للتعديل بالكامل وليست صوراً ثابتة.",
    },
    {
      titleEn: "Market Opportunity (TAM / SAM / SOM)",
      titleAr: "حجم الفرصة السوقية",
      subtitleEn: "Capturing high-value enterprise knowledge workflows globally & in MENA",
      subtitleAr: "استهداف سوق الإنتاجية المؤسسية عالمياً وفي منطقة الشرق الأوسط",
      bulletsEn: [
        "TAM: $42B global enterprise presentation, BI storytelling, and document automation market",
        "SAM: $6.8B regional & multilingual enterprise teams across GCC, Europe, and North America",
        "SOM: $420M initial 3-year target across consulting, financial services, and tech",
      ],
      bulletsAr: [
        "السوق الكلي (TAM): 42 مليار دولار لأتمتة العروض والوثائق عالمياً",
        "السوق القابل للاستحواذ (SAM): 6.8 مليار دولار للفرق متعددة اللغات",
        "الحصة المستهدفة خلال 3 سنوات (SOM): 420 مليون دولار في القطاعات الرئيسية",
      ],
      layout: "title-body",
      accentShape: "bar",
      chart: {
        kind: "bar",
        titleEn: "Addressable Market ($B)",
        titleAr: "حجم السوق (مليار دولار)",
        categoriesEn: ["Global TAM", "Bilingual SAM", "5Y Target", "3Y SOM"],
        categoriesAr: ["السوق الكلي", "السوق المتاح", "هدف 5 سنوات", "هدف 3 سنوات"],
        values: [42.0, 6.8, 1.4, 0.42],
        unit: "$B",
      },
      notesEn: "Walk bottom-up from seat counts in MENA & international consulting/finance teams.",
      notesAr: "اشرح الحساب التصاعدي لحجم السوق بناءً على عدد الفرق المؤسسية.",
    },
    {
      titleEn: "Traction & ARR Trajectory",
      titleAr: "مؤشرات النمو والإيرادات المتكررة",
      subtitleEn: "Consistent quarter-over-quarter expansion led by team upgrades",
      subtitleAr: "نمو متسارع ربع سنوي مدفوع بتوسع اشتراكات الفرق والشركات",
      bulletsEn: [
        "ARR scaled from $0.4M to $2.4M over five quarters with 128% net dollar retention",
        "Average time-to-first-export dropped under 4 minutes across onboarded analysts",
        "Organic team referrals now drive 44% of qualified enterprise pipeline",
      ],
      bulletsAr: [
        "نمو الإيرادات المتكررة من 0.4 إلى 2.4 مليون دولار بمعدل احتفاظ صافي 128%",
        "انخفاض متوسط وقت إنتاج أول عرض احترافي إلى أقل من 4 دقائق",
        "44% من العملاء الجدد يأتون عبر توصيات الفرق المستخدمة حالياً",
      ],
      layout: "title-body",
      accentShape: "card",
      chart: {
        kind: "line",
        titleEn: "ARR Growth Trajectory",
        titleAr: "نمو الإيرادات المتكررة",
        categoriesEn: ["Q1", "Q2", "Q3", "Q4", "Q1'27"],
        categoriesAr: ["ر1", "ر2", "ر3", "ر4", "ر1'27"],
        values: [0.4, 0.85, 1.35, 1.9, 2.45],
        unit: "$M",
      },
      notesEn: "Highlight the compounding slope between Q2 and Q4 after bilingual launch.",
      notesAr: "سلط الضوء على تسارع النمو بعد إطلاق الميزات ثنائية اللغة.",
    },
    {
      titleEn: "Product & Technical Architecture",
      titleAr: "البنية التقنية والمنتج",
      subtitleEn: "Composable validation, pluggable AI providers, and zero-lock export",
      subtitleAr: "معالجة منظمة ومزودو ذكاء اصطناعي مرنون وتصدير عالي الدقة",
      bulletsEn: [
        "Strict schema-validated generation guarantees clean JSON structure on every run",
        "Provider-agnostic AI gateway: run private OpenAI-compatible endpoints or local models",
        "Direct OOXML synthesis outputs native shapes, vector charts, and speaker notes",
        "Tenant-isolated asset pipeline with magic-byte validation and rate-limited APIs",
      ],
      bulletsAr: [
        "التحقق الهيكلي الصارم يضمن مخرجات منظمة وخالية من الأخطاء في كل مرة",
        "بوابة ذكاء اصطناعي مرنة تدعم النماذج السحابية والخاصة داخل الشركة",
        "توليد ملفات Office أصلية بأشكال ورسوم بيانية متجهة قابلة للتعديل",
        "حماية وعزل كامل لبيانات وأصول كل عميل ومؤسسة",
      ],
      layout: "two-col",
      accentShape: "bar",
      notesEn: "Reassure technical diligence partners on security, schema guarantees, and model flexibility.",
      notesAr: "وضح مرونة البنية التقنية وأمان البيانات للمستثمرين التقنيين.",
    },
    {
      titleEn: "Customer Proof & ROI",
      titleAr: "أثر المنتج على العملاء",
      subtitleEn: "“What used to take an analyst two days now ships in 15 minutes.”",
      subtitleAr: "«ما كان يستغرق يومين من فريق التحليل أصبح جاهزاً خلال 15 دقيقة»",
      bulletsEn: [
        "78% reduction in slide preparation cycles across pilot advisory engagements",
        "Zero external translation agencies needed for executive bilingual decks",
      ],
      bulletsAr: [
        "خفض بنسبة 78% في وقت إعداد العروض لدى عملاء المرحلة التجريبية",
        "استغناء كامل عن مكاتب التنسيق الخارجية للعروض ثنائية اللغة",
      ],
      layout: "quote",
      accentShape: "card",
      notesEn: "Share concrete ROI numbers from an anchor pilot customer.",
      notesAr: "استعرض شهادة العميل والعائد المباشر على الاستثمار.",
    },
    {
      titleEn: "Revenue Mix & Unit Economics",
      titleAr: "نموذج الإيرادات واقتصاديات الوحدة",
      subtitleEn: "High-margin SaaS with enterprise annual contracts",
      subtitleAr: "نموذج برمجيات بهامش ربح مرتفع وعقود سنوية للمؤسسات",
      bulletsEn: [
        "82% blended gross margin even at heavy multi-modal generation volume",
        "CAC payback under 7 months with $18.4k average enterprise annual contract value",
        "Expansion levers: workspace seats, custom brand themes, and dedicated API tiers",
      ],
      bulletsAr: [
        "هامش ربح إجمالي 82% حتى مع الاستخدام المكثف لتوليد المحتوى",
        "فترة استرداد تكلفة الاستحواذ أقل من 7 أشهر بعقود سنوية مجزية",
        "محركات توسع واضحة عبر زيادة المقاعد والقوالب المؤسسية المخصصة",
      ],
      layout: "title-body",
      accentShape: "bar",
      chart: {
        kind: "pie",
        titleEn: "Revenue Mix by Tier",
        titleAr: "توزيع الإيرادات حسب الباقة",
        categoriesEn: ["Enterprise", "Growth Teams", "Pro Seats", "API Add-ons"],
        categoriesAr: ["المؤسسات", "الفرق النامية", "الأفراد المحترفون", "واجهات البرمجة"],
        values: [48, 29, 15, 8],
        unit: "%",
      },
      notesEn: "Walk through gross margin and ACV progression as Enterprise grows toward 55%+.",
      notesAr: "اشرح استدامة الهوامش الربحية ودور العقود المؤسسية.",
    },
    {
      titleEn: "Go-To-Market Strategy",
      titleAr: "استراتيجية التوسع والانتشار",
      subtitleEn: "Product-led adoption paired with regional enterprise partnerships",
      subtitleAr: "نمو مدفوع بتجربة المنتج مع شراكات استراتيجية في المنطقة",
      bulletsEn: [
        "Land-and-expand inside strategy teams, PMOs, and venture portfolios",
        "Curated bilingual template gallery turning first export into a team share loop",
        "Channel partnerships with regional cloud and digital transformation integrators",
        "Dedicated Solutions Engineering for regulated finance and public-sector rollouts",
      ],
      bulletsAr: [
        "دخول سريع عبر فرق الاستراتيجية ومكاتب إدارة المشاريع وصناديق الاستثمار",
        "مكتبة قوالب جاهزة تحفز المشاركة والتبني العضوي داخل المؤسسة",
        "شراكات توزيع مع مزودي الحوسبة السحابية وشركات التكامل الرقمي",
        "فرق هندسة حلول مخصصة للقطاعات المالية والحكومية",
      ],
      layout: "two-col",
      accentShape: "badge",
      notesEn: "Contrast low-CAC self-serve funnel with curated enterprise conversion.",
      notesAr: "وضح التكامل بين المبيعات المباشرة والتبني السريع للمنتج.",
    },
    {
      titleEn: "Competitive Moat",
      titleAr: "الميزة التنافسية المستدامة",
      subtitleEn: `Why horizontal slide tools cannot easily replicate ${subject}`,
      subtitleAr: `لماذا يصعب على الأدوات التقليدية منافسة ${subject}`,
      bulletsEn: [
        "Deep bilingual RTL/LTR layout engine tested across Arabic and Latin typography",
        "Chart-native OOXML pipeline preserving live Excel-backed series in exported decks",
        "Custom enterprise brand governance, private model routing, and auditability",
        "Compounding proprietary dataset of structured Arabic-English executive layouts",
      ],
      bulletsAr: [
        "محرك تنسيق متقدم للنصوص المختلطة العربية والإنجليزية بدون أخطاء محاذاة",
        "تصدير رسوم بيانية أصلية قابلة للتحديث داخل ملفات Office",
        "حوكمة كاملة للهوية البصرية وربط مرن مع النماذج الخاصة",
        "بيانات تدريب متراكمة لهياكل التقارير التنفيذية في المنطقة",
      ],
      layout: "two-col",
      accentShape: "bar",
      notesEn: "Position clearly against generic slide tools and single-language copilots.",
      notesAr: "قارن نقاط القوة الجوهرية أمام المنافسين العامين.",
    },
    {
      titleEn: "Use of Funds & Next Milestones",
      titleAr: "خطة توظيف الاستثمار والأهداف القادمة",
      subtitleEn: `Scaling ${subject} to $10M ARR over the next 18 months`,
      subtitleAr: `خطة الوصول إلى 10 ملايين دولار إيرادات متكررة خلال 18 شهراً`,
      bulletsEn: [
        "45% R&D & AI: multi-chart synthesis, live data connectors, and enterprise SSO",
        "35% Go-To-Market: regional enterprise AEs in Riyadh, Dubai, and London",
        "20% Infrastructure & Security: SOC 2 Type II certification and VPC deployments",
      ],
      bulletsAr: [
        "45% لتطوير المنتج والذكاء الاصطناعي والربط المباشر بقواعد البيانات",
        "35% لتوسيع المبيعات المؤسسية في الرياض ودبي ولندن",
        "20% للبنية التحتية والاعتمادات الأمنية المؤسسية",
      ],
      layout: "title-body",
      accentShape: "card",
      chart: {
        kind: "bar",
        titleEn: "18-Month Capital Allocation",
        titleAr: "توزيع رأس المال خلال 18 شهراً",
        categoriesEn: ["R&D & AI", "Enterprise GTM", "Security & Ops", "Working Cap"],
        categoriesAr: ["التطوير والذكاء", "التوسع والمبيعات", "الأمن والتشغيل", "رأس المال العامل"],
        values: [45, 35, 12, 8],
        unit: "%",
      },
      notesEn: "Close clearly with the round target, runway, and next-milestone valuation inflection.",
      notesAr: "اختم بتحديد حجم الجولة المطلوبة والأهداف القابلة للقياس.",
    },
    {
      titleEn: "Leadership & Execution Track Record",
      titleAr: "فريق القيادة وسجل الإنجاز",
      subtitleEn: "Operators with deep enterprise AI, design systems, and MENA scaling experience",
      subtitleAr: "فريق مؤسس يجمع بين هندسة الذكاء الاصطناعي وبناء المنتجات العالمية",
      bulletsEn: [
        "Founding engineering team previously built high-throughput SaaS and document engines",
        "Commercial leadership scaled B2B revenue across GCC and European enterprise accounts",
        "Advised by senior leaders from regional financial institutions and AI research labs",
      ],
      bulletsAr: [
        "فريق هندسي صاحب سجل قوي في بناء منصات البرمجيات ومحركات الوثائق",
        "قيادة تجارية متمرسة في توسيع مبيعات الشركات في الخليج وأوروبا",
        "مجلس استشاري من قيادات القطاع المالي ومختبرات الذكاء الاصطناعي",
      ],
      layout: "two-col",
      accentShape: "bar",
      notesEn: "Highlight complementary founder-market fit and velocity.",
      notesAr: "أبرز تكامل خبرات الفريق وقدرته على التنفيذ السريع.",
    },
    {
      titleEn: "18-Month Roadmap & Milestones",
      titleAr: "خارطة الطريق للأشهر الـ18 القادمة",
      subtitleEn: "Clear execution gates from seed deployment to Series A readiness",
      subtitleAr: "مراحل تنفيذ واضحة للانتقال نحو جولة التوسع الكبرى",
      bulletsEn: [
        "Q1–Q2: Live ERP/CRM chart connectors, collaborative commenting, and SOC 2 audit",
        "Q3–Q4: Expand from 42 to 180+ enterprise workspaces across GCC & EU",
        "Q5–Q6: Launch automated quarterly board-pack workflows and surpass $8M+ ARR",
      ],
      bulletsAr: [
        "النصف الأول: الربط المباشر بأنظمة البيانات والتعاون الفوري للفريق",
        "النصف الثاني: التوسع من 42 إلى أكثر من 180 مؤسسة نشطة",
        "النصف الثالث: أتمتة حزم التقارير الدورية وتجاوز 8 ملايين دولار ARR",
      ],
      layout: "title-body",
      accentShape: "bar",
      notesEn: "Show investors exactly what de-risks the Series A milestone.",
      notesAr: "وضح المؤشرات التي تفتح الباب لجولة التمويل التالية.",
    },
    {
      titleEn: `Partner With ${subject}`,
      titleAr: `كن شريكاً في رحلة ${subject}`,
      subtitleEn: "Let’s build the standard for bilingual executive creation",
      subtitleAr: "لنصنع معاً المعيار الجديد لإنتاج العروض والوثائق التنفيذية",
      bulletsEn: [
        "Raising Seed Extension to accelerate enterprise connectors and MENA/EU GTM",
        "Live product sandbox & data room available immediately following this session",
        `Thank you — ${subject} Leadership Team`,
      ],
      bulletsAr: [
        "نرحب بالشركاء الاستراتيجيين لتسريع الانتشار في الشرق الأوسط وأوروبا",
        "بيئة تجربة حية وغرفة بيانات متاحة مباشرة بعد الاجتماع",
        `شكراً لكم — فريق قيادة ${subject}`,
      ],
      layout: "title",
      accentShape: "badge",
      notesEn: "Leave clear contact details and offer a live interactive demo right in the studio.",
      notesAr: "اترك دعوة واضحة للتواصل وعرض تجربة حية مباشرة.",
    },
  ];
}

function buildReportBlueprints(subject: string, audience: string): SlideBlueprint[] {
  return [
    {
      titleEn: `${subject}: Performance & Strategy Brief`,
      titleAr: `${subject}: تقرير الأداء والاستراتيجية`,
      subtitleEn: `Prepared for ${audience || "Executive Leadership"}`,
      subtitleAr: `مُعدّ إلى ${audience || "الإدارة التنفيذية"}`,
      bulletsEn: [
        `Comprehensive assessment of ${subject} delivery, KPIs, and operational priorities`,
        "Actionable recommendations sequenced across immediate and next-quarter horizons",
      ],
      bulletsAr: [
        `تقييم شامل لأداء ${subject} ومؤشرات الكفاءة والأولويات التشغيلية`,
        "توصيات عملية مرتبة زمنياً للربع الحالي والربع القادم",
      ],
      layout: "title",
      accentShape: "badge",
      notesEn: "Set context on scope, reporting window, and decision objectives.",
      notesAr: "حدد نطاق التقرير والفترة الزمنية والقرارات المطلوبة.",
    },
    {
      titleEn: "Executive KPI Scorecard",
      titleAr: "بطاقة مؤشرات الأداء الرئيسية",
      subtitleEn: "Headline output vs. operational targets",
      subtitleAr: "الأداء الفعلي مقارنةً بالمستهدفات المخططة",
      bulletsEn: [
        "Primary delivery throughput exceeded baseline plan by 18% this cycle",
        "Quality & SLA compliance held above 97.5% during peak demand",
        "Cost per unit declined 11% through workflow automation",
      ],
      bulletsAr: [
        "تجاوز معدل الإنجاز الأساسي الخطة بنسبة 18% خلال الدورة الحالية",
        "حافظت جودة التنفيذ على التزام يفوق 97.5% وقت الذروة",
        "انخفضت التكلفة التشغيلية لكل وحدة بنسبة 11% بفضل الأتمتة",
      ],
      layout: "title-body",
      accentShape: "bar",
      chart: {
        kind: "bar",
        titleEn: "Quarterly Output Index",
        titleAr: "مؤشر الإنجاز الربع سنوي",
        categoriesEn: ["Q1", "Q2", "Q3", "Q4"],
        categoriesAr: ["ر1", "ر2", "ر3", "ر4"],
        values: [82, 91, 104, 118],
        unit: "pts",
      },
      notesEn: "Walk leaders through key variances against plan.",
      notesAr: "استعرض الفروقات الأساسية مقارنة بالخطة.",
    },
    {
      titleEn: "Momentum & Trend Analysis",
      titleAr: "تحليل الاتجاه والزخم",
      subtitleEn: "Sustained improvement across core workstreams",
      subtitleAr: "تحسن مستمر عبر المسارات التشغيلية الأساسية",
      bulletsEn: [
        "Cycle time compressed steadily from 9.4 days down to 4.1 days",
        "Adoption across cross-functional squads crossed 85% active usage",
      ],
      bulletsAr: [
        "تقلص زمن دورة التنفيذ تدريجياً من 9.4 أيام إلى 4.1 أيام",
        "تجاوز التبني الفعلي عبر الفرق المشتركة نسبة 85%",
      ],
      layout: "title-body",
      accentShape: "card",
      chart: {
        kind: "line",
        titleEn: "Adoption Trend (%)",
        titleAr: "منحنى التبني (%)",
        categoriesEn: ["Jan", "Mar", "May", "Jul", "Sep"],
        categoriesAr: ["يناير", "مارس", "مايو", "يوليو", "سبتمبر"],
        values: [42, 56, 68, 79, 88],
        unit: "%",
      },
      notesEn: "Emphasize consistent upward slope without regressions.",
      notesAr: "أبرز ثبات التحسن دون تراجعات.",
    },
    {
      titleEn: "Resource & Effort Breakdown",
      titleAr: "توزيع الموارد والجهد",
      subtitleEn: "Balancing core operations with strategic initiatives",
      subtitleAr: "الموازنة بين التشغيل اليومي والمبادرات الاستراتيجية",
      bulletsEn: [
        "44% allocated to high-impact delivery and customer growth programs",
        "28% invested in platform reliability, tooling, and quality controls",
        "18% dedicated to process automation reducing manual handoffs",
      ],
      bulletsAr: [
        "44% مخصصة للبرامج ذات الأثر المباشر على العملاء والنمو",
        "28% لاستثمارات الاعتمادية والجودة والأدوات",
        "18% لأتمتة العمليات وتقليل التدخل اليدوي",
      ],
      layout: "title-body",
      accentShape: "bar",
      chart: {
        kind: "pie",
        titleEn: "Allocation Mix (%)",
        titleAr: "توزيع الموارد (%)",
        categoriesEn: ["Delivery", "Quality", "Automation", "Enablement"],
        categoriesAr: ["التنفيذ", "الجودة", "الأتمتة", "التمكين"],
        values: [44, 28, 18, 10],
        unit: "%",
      },
      notesEn: "Explain whether reallocation is needed for next quarter.",
      notesAr: "وضح ما إذا كان هناك حاجة لإعادة توجيه الموارد.",
    },
    {
      titleEn: "Key Risks & Mitigations",
      titleAr: "المخاطر الرئيسية وخطط التخفيف",
      subtitleEn: "Proactive guardrails protecting delivery timelines",
      subtitleAr: "ضوابط استباقية لحماية الجداول الزمنية والجودة",
      bulletsEn: [
        "Dependency bottlenecks mitigated via automated validation gates",
        "Skill concentration addressed through cross-training and shared runbooks",
        "Scope creep governed by bi-weekly milestone sign-offs",
      ],
      bulletsAr: [
        "معالجة اختناقات الاعتماديات عبر بوابات تحقق آلية",
        "تقليل الاعتماد الفردي عبر التدريب المتبادل وتوثيق الإجراءات",
        "ضبط نطاق العمل بمراجعات دورية كل أسبوعين",
      ],
      layout: "two-col",
      accentShape: "card",
      notesEn: "Assign clear risk owners before closing.",
      notesAr: "حدد مسؤول كل خطر قبل نهاية العرض.",
    },
    {
      titleEn: "90-Day Action Plan",
      titleAr: "خطة العمل للـ90 يوماً القادمة",
      subtitleEn: "Priorities, owners, and measurable checkpoints",
      subtitleAr: "الأولويات والمسؤوليات ونقاط التحقق",
      bulletsEn: [
        "Days 1–30: Standardize reporting templates and automate weekly KPI capture",
        "Days 31–60: Scale automation playbook to remaining regional business units",
        "Days 61–90: Audit ROI impact and lock budget targets for the upcoming cycle",
      ],
      bulletsAr: [
        "الأيام 1–30: توحيد قوالب التقارير وأتمتة جمع المؤشرات الأسبوعية",
        "الأيام 31–60: تعميم منهجية الأتمتة على بقية الوحدات التشغيلية",
        "الأيام 61–90: قياس العائد الفعلي واعتماد مستهدفات الدورة التالية",
      ],
      layout: "title-body",
      accentShape: "badge",
      notesEn: "Confirm ownership and review cadence with stakeholders.",
      notesAr: "أكد المسؤوليات وجدول المتابعة مع أصحاب المصلحة.",
    },
  ];
}

function buildEducationalBlueprints(subject: string, audience: string): SlideBlueprint[] {
  return [
    {
      titleEn: `${subject}: Core Concepts & Practice`,
      titleAr: `${subject}: المفاهيم الأساسية والتطبيق العملي`,
      subtitleEn: `Learning Module · ${audience || "Students & Practitioners"}`,
      subtitleAr: `وحدة تعليمية · ${audience || "الطلاب والمتدربون"}`,
      bulletsEn: [
        `Clear mental models explaining how ${subject} works in real-world systems`,
        "Hands-on examples, visual intuition, and key takeaways you can apply immediately",
      ],
      bulletsAr: [
        `فهم مبسط وعملي لآلية عمل ${subject} وتطبيقاتها الواقعية`,
        "أمثلة تطبيقية واضحة وخلاصة قابلة للتنفيذ مباشرة",
      ],
      layout: "title",
      accentShape: "badge",
      notesEn: "Introduce the big picture before diving into definitions.",
      notesAr: "اعرض الصورة العامة قبل الدخول في التفاصيل التقنية.",
    },
    {
      titleEn: `Foundations of ${subject}`,
      titleAr: `أساسيات ${subject}`,
      subtitleEn: "Core building blocks explained step by step",
      subtitleAr: "الركائز الأساسية مشروحة خطوة بخطوة",
      bulletsEn: [
        `Core purpose: what problem ${subject} solves and why it matters today`,
        "Primary components and how inputs transform into measurable outputs",
        "Key terminology every learner needs before analyzing real case studies",
      ],
      bulletsAr: [
        `الهدف الأساسي: المشكلة التي يعالجها ${subject} وأهميته اليوم`,
        "المكونات الرئيسية وكيف تتحول المدخلات إلى نتائج ملموسة",
        "المصطلحات الأساسية اللازمة قبل دراسة الحالات العملية",
      ],
      layout: "two-col",
      accentShape: "bar",
      notesEn: "Pause to check comprehension of foundational terms.",
      notesAr: "تأكد من استيعاب المفاهيم الأساسية قبل الانتقال.",
    },
    {
      titleEn: "How It Works in Practice",
      titleAr: "آلية العمل في التطبيق العملي",
      subtitleEn: "From first principles to measurable efficiency",
      subtitleAr: "من المبادئ النظرية إلى الأثر العملي القابل للقياس",
      bulletsEn: [
        "Step 1 — Capture clean inputs and establish a reliable baseline",
        "Step 2 — Apply core transformation rules with clear quality checks",
        "Step 3 — Measure outcomes and iterate using feedback loops",
      ],
      bulletsAr: [
        "الخطوة 1 — جمع المدخلات الدقيقة وتحديد خط الأساس",
        "الخطوة 2 — تطبيق القواعد الأساسية مع فحوصات الجودة",
        "الخطوة 3 — قياس النتائج والتحسين المستمر بناءً على التغذية الراجعة",
      ],
      layout: "title-body",
      accentShape: "card",
      notesEn: "Walk through each stage using one concrete everyday example.",
      notesAr: "اشرح كل مرحلة عبر مثال واقعي واحد.",
    },
    {
      titleEn: "Real-World Case Study",
      titleAr: "دراسة حالة واقعية",
      subtitleEn: `Seeing ${subject} create measurable impact`,
      subtitleAr: `تأثير تطبيق ${subject} في بيئة حقيقية`,
      bulletsEn: [
        "Starting baseline: high friction, fragmented steps, and inconsistent quality",
        `After applying ${subject}: faster turnaround and higher reliability`,
        "Key lesson: small structural improvements compound dramatically over time",
      ],
      bulletsAr: [
        "الوضع السابق: خطوات متفرقة واستهلاك مرتفع للوقت",
        `بعد تطبيق ${subject}: سرعة أكبر وموثوقية أعلى في النتائج`,
        "الدرس المستفاد: التحسينات المنهجية البسيطة تتضاعف مع الوقت",
      ],
      layout: "two-col",
      accentShape: "bar",
      notesEn: "Ask students what variable changed the outcome most.",
      notesAr: "اسأل المتدربين عن العامل الأكثر تأثيراً في النتيجة.",
    },
    {
      titleEn: "Common Misconceptions",
      titleAr: "مفاهيم شائعة يجب تصحيحها",
      subtitleEn: "Avoiding the pitfalls beginners encounter",
      subtitleAr: "تجنب الأخطاء الشائعة في البداية",
      bulletsEn: [
        "Mistake: focusing on tools before understanding the underlying workflow",
        "Correction: define the goal and constraints clearly first, then pick tooling",
        "Remember: consistency beats complexity in both study and production",
      ],
      bulletsAr: [
        "خطأ شائع: التركيز على الأدوات قبل فهم منهجية العمل نفسها",
        "التصحيح: حدد الهدف والقيود بوضوح أولاً ثم اختر الأداة المناسبة",
        "قاعدة ذهبية: الاتساق والوضوح أهم من التعقيد",
      ],
      layout: "title-body",
      accentShape: "card",
      notesEn: "Compare common myth vs. verified practice.",
      notesAr: "قارن بين الفهم الخاطئ والممارسة الصحيحة.",
    },
    {
      titleEn: "Key Takeaways & Next Exercises",
      titleAr: "أهم الخلاصات والخطوة التالية",
      subtitleEn: "Turn concepts into retained skill",
      subtitleAr: "تحويل المعرفة النظرية إلى مهارة عملية",
      bulletsEn: [
        `Review the three core principles of ${subject} and explain them in your own words`,
        "Complete the hands-on exercise using a realistic dataset or scenario",
        "Compare your output against the quality checklist before moving on",
      ],
      bulletsAr: [
        `راجع المبادئ الثلاثة الأساسية في ${subject} ولخصها بأسلوبك`,
        "طبّق التمرين العملي على سيناريو أو مجموعة بيانات واقعية",
        "تحقق من جودة النتيجة مقارنةً بقائمة المعايير المعتمدة",
      ],
      layout: "title-body",
      accentShape: "badge",
      notesEn: "Summarize takeaways and assign the closing reflection.",
      notesAr: "لخص النقاط المحورية وحدد التمرين التطبيقي.",
    },
  ];
}

function buildProductBlueprints(subject: string, audience: string): SlideBlueprint[] {
  return [
    {
      titleEn: `${subject}: Strategic Vision & Launch`,
      titleAr: `${subject}: الرؤية الاستراتيجية والإطلاق`,
      subtitleEn: `Designed for ${audience || "Modern Teams"}`,
      subtitleAr: `مصممة لخدمة ${audience || "الفرق الحديثة"}`,
      bulletsEn: [
        `${subject} brings speed, clarity, and bilingual precision to everyday workflows`,
        "Built to move teams smoothly from initial concept to polished delivery",
      ],
      bulletsAr: [
        `تمنح ${subject} الفرق سرعة ووضوحاً ودقة ثنائية اللغة في العمل اليومي`,
        "مصممة لنقل الأفكار بسلاسة من التصور الأولي إلى مخرجات جاهزة",
      ],
      layout: "title",
      accentShape: "badge",
      notesEn: `Open with the core promise of ${subject}.`,
      notesAr: `ابدأ بالوعد الأساسي لمنصة ${subject}.`,
    },
    {
      titleEn: "Customer Pain & Opportunity",
      titleAr: "احتياج العملاء والفرصة",
      subtitleEn: "Eliminating friction across fragmented tools",
      subtitleAr: "إزالة التعقيد الناتج عن تشتت الأدوات",
      bulletsEn: [
        "Teams switch between 4+ apps just to outline, chart, translate, and format",
        "Inconsistent visual branding erodes trust in client-facing deliverables",
        "Automating structure lets experts spend energy on insights rather than layout",
      ],
      bulletsAr: [
        "تضطر الفرق للتنقل بين عدة تطبيقات للكتابة والرسوم والتنسيق والترجمة",
        "عدم اتساق الهوية البصرية يضعف جودة المخرجات أمام العملاء",
        "أتمتة البنية تتيح للخبراء التركيز على التحليل والمحتوى",
      ],
      layout: "title-body",
      accentShape: "bar",
      notesEn: "Connect daily workflow pain directly to team productivity.",
      notesAr: "اربط تحديات العمل اليومي بأثرها على إنتاجية الفريق.",
    },
    {
      titleEn: "Core Product Capabilities",
      titleAr: "القدرات الرئيسية للمنتج",
      subtitleEn: "Everything required to draft, refine, and export",
      subtitleAr: "كل ما يحتاجه الفريق للإنشاء والتحرير والتصدير",
      bulletsEn: [
        "Structured generation paired with an intuitive, responsive slide & doc editor",
        "Built-in themes, vector charts, media uploads, and speaker notes",
        "First-class Arabic RTL and English LTR layout parity",
        "One-click export to native PPTX, DOCX, and print-ready PDF",
      ],
      bulletsAr: [
        "توليد هيكلي ذكي مع محرر مرن للشرائح والمستندات",
        "ثيمات متكاملة ورسوم بيانية متجهة ودعم الصور والملاحظات",
        "توافق كامل مع اللغة العربية والإنجليزية في نفس المشروع",
        "تصدير مباشر بصيغ PowerPoint وWord وPDF",
      ],
      layout: "two-col",
      accentShape: "bar",
      notesEn: "Demo one end-to-end flow from prompt to exported file.",
      notesAr: "اعرض مسار عمل كامل من الفكرة حتى التصدير.",
    },
    {
      titleEn: "Measured Impact & Benchmarks",
      titleAr: "الأثر المقاس ومؤشرات الأداء",
      subtitleEn: "Tangible gains across speed, consistency, and adoption",
      subtitleAr: "مكاسب ملموسة في السرعة والاتساق والتبني",
      bulletsEn: [
        "3.8x faster turnaround from brief to stakeholder-ready deliverable",
        "94% brand & layout consistency score across multi-team rollouts",
        "Rapid weekly active engagement among analysts, founders, and educators",
      ],
      bulletsAr: [
        "تسريع إنجاز المخرجات بمعدل 3.8 أضعاف مقارنة بالطريقة التقليدية",
        "اتساق بصري وتنظيمي بنسبة 94% عبر مختلف الفرق",
        "نمو مستمر في الاستخدام النشط أسبوعياً",
      ],
      layout: "title-body",
      accentShape: "card",
      chart: {
        kind: "bar",
        titleEn: "Workflow Speedup (Hours Saved / Deck)",
        titleAr: "توفير الوقت (ساعات لكل عرض)",
        categoriesEn: ["Research", "Drafting", "Charting", "Formatting"],
        categoriesAr: ["البحث", "الصياغة", "الرسوم", "التنسيق"],
        values: [2.1, 3.0, 1.8, 2.6],
        unit: "hrs",
      },
      notesEn: "Point to time saved specifically in charting and formatting.",
      notesAr: "أبرز الوقت الموفر في إعداد الرسوم والتنسيق.",
    },
    {
      titleEn: "Rollout Plan & Next Steps",
      titleAr: "خطة الإطلاق والخطوات القادمة",
      subtitleEn: `Deploying ${subject} across priority teams`,
      subtitleAr: `تفعيل ${subject} عبر الفرق ذات الأولوية`,
      bulletsEn: [
        "Phase 1: Launch pilot workspace with shared templates and brand theme",
        "Phase 2: Train team leads and integrate standard export checklists",
        "Phase 3: Measure cycle-time reduction after 30 days and expand seats",
      ],
      bulletsAr: [
        "المرحلة 1: إطلاق مساحة عمل تجريبية بقوالب موحدة وهوية بصرية معتمدة",
        "المرحلة 2: تمكين قادة الفرق واعتماد معايير المراجعة والتصدير",
        "المرحلة 3: قياس أثر توفير الوقت بعد 30 يوماً وتوسيع النطاق",
      ],
      layout: "two-col",
      accentShape: "badge",
      notesEn: "Close with clear pilot owners and start dates.",
      notesAr: "اختم بتحديد فريق البداية وتاريخ الانطلاق.",
    },
  ];
}

function selectBlueprints(pool: SlideBlueprint[], targetCount: number): SlideBlueprint[] {
  const first = pool[0]!;
  const last = pool[pool.length - 1]!;
  if (targetCount <= pool.length) {
    if (targetCount <= 2) {
      return [first, last];
    }
    return [...pool.slice(0, targetCount - 1), last];
  }
  const extraCount = targetCount - pool.length;
  const out = [...pool.slice(0, -1)];
  for (let i = 0; i < extraCount; i++) {
    out.push({
      titleEn: `Deep Dive ${i + 1}: Strategic Execution`,
      titleAr: `تعمق ${i + 1}: التنفيذ الاستراتيجي`,
      subtitleEn: "Detailed breakdown of operational KPIs and regional expansion",
      subtitleAr: "تفصيل إضافي لمؤشرات الأداء وخطط التوسع",
      bulletsEn: [
        "Dedicated milestone tracking across product, distribution, and customer success",
        "Clear governance cadence ensuring predictable quarterly delivery",
      ],
      bulletsAr: [
        "متابعة دقيقة لمراحل التطوير والتوزيع ونجاح العملاء",
        "حوكمة واضحة تضمن انتظام الإنجاز ربع السنوي",
      ],
      layout: "title-body",
      accentShape: "bar",
      notesEn: "Expand with supporting team metrics during Q&A.",
      notesAr: "استعرض مؤشرات الدعم الإضافية عند النقاش.",
    });
  }
  out.push(last);
  return out;
}

function formatSlide(
  bp: SlideBlueprint,
  lang: "en" | "ar",
  bilingual: boolean,
  includeCharts: boolean,
): OutlineSlide {
  const isAr = lang === "ar";
  const chart =
    includeCharts && bp.chart
      ? {
          kind: bp.chart.kind,
          title: bilingual
            ? `${bp.chart.titleEn} | ${bp.chart.titleAr}`
            : isAr
              ? bp.chart.titleAr
              : bp.chart.titleEn,
          categories: isAr && !bilingual ? bp.chart.categoriesAr : bp.chart.categoriesEn,
          values: bp.chart.values,
          unit: bp.chart.unit,
        }
      : undefined;

  if (bilingual) {
    const enBullets = bp.bulletsEn.slice(0, 2);
    const arBullets = bp.bulletsAr.slice(0, 2);
    const mergedBullets = [...enBullets, ...arBullets];
    return {
      title: `${bp.titleEn} | ${bp.titleAr}`,
      subtitle: `${bp.subtitleEn} · ${bp.subtitleAr}`,
      bullets: mergedBullets,
      layout: bp.layout,
      accentShape: bp.accentShape,
      chart,
      notes: `${bp.notesEn}\n${bp.notesAr}`,
    };
  }

  return {
    title: isAr ? bp.titleAr : bp.titleEn,
    subtitle: isAr ? bp.subtitleAr : bp.subtitleEn,
    bullets: isAr ? bp.bulletsAr : bp.bulletsEn,
    layout: bp.layout,
    accentShape: bp.accentShape,
    chart,
    notes: isAr ? bp.notesAr : bp.notesEn,
  };
}

export class DemoProvider implements AIProvider {
  readonly name = "demo";
  readonly model = "demo-smart-template";
  readonly isDemo = true;

  async generateOutline(
    input: GenerateInput,
    type: "presentation" | "document",
    language: "en" | "ar",
  ): Promise<Outline> {
    const subject = extractSubject(input.prompt);
    const domain = detectDomain(input.prompt);
    const includeCharts = detectCharts(input.prompt, domain);
    const bilingual = detectBilingual(input.prompt);
    const targetCount = parseExplicitSlideCount(
      input.prompt,
      DEFAULT_SLIDE_COUNT[input.length],
    );
    const audience = input.audience?.trim() || "";

    if (type === "presentation") {
      const pool =
        domain === "investor"
          ? buildInvestorBlueprints(subject, audience)
          : domain === "report"
            ? buildReportBlueprints(subject, audience)
            : domain === "educational"
              ? buildEducationalBlueprints(subject, audience)
              : buildProductBlueprints(subject, audience);

      const selected = selectBlueprints(pool, targetCount);
      const slides: OutlineSlide[] = selected.map((bp) =>
        formatSlide(bp, language, bilingual, includeCharts),
      );

      const deckTitle = bilingual
        ? `${subject} — Executive Deck | عرض تنفيذي`
        : language === "ar"
          ? `${subject} — عرض تقديمي`
          : `${subject} — ${domain === "investor" ? "Investor Deck" : domain === "report" ? "Executive Report" : "Presentation"}`;

      return {
        title: deckTitle.slice(0, 180),
        language,
        slides,
      };
    }

    const isAr = language === "ar";
    const blocks: OutlineBlock[] = isAr
      ? [
          {
            kind: "heading",
            level: 1,
            text: bilingual ? `${subject} | تقرير تنفيذي` : subject,
          },
          {
            kind: "paragraph",
            level: 0,
            text: `يستعرض هذا المستند الرؤية الاستراتيجية، والأهداف التشغيلية، ومؤشرات الأداء الرئيسية لمشروع «${subject}» بما يناسب ${audience || "القيادات وصناع القرار"}.`,
          },
          {
            kind: "heading",
            level: 2,
            text: "1. التحدي والفرصة",
          },
          {
            kind: "paragraph",
            level: 0,
            text: `تحتاج الفرق المؤسسية إلى آلية موحدة تقلل وقت الإعداد اليدوي وتضمن اتساق البيانات والرسوم البيانية عند إعداد ملفات ${subject}.`,
          },
          {
            kind: "list",
            level: 0,
            text: "",
            ordered: false,
            items: [
              "توحيد هيكلة المحتوى والعناصر المرئية عبر جميع الأقسام",
              "دعم الكتابة بالعربية والإنجليزية مع تصدير مباشر لصيغ Office",
              "قياس النتائج ربع سنوياً وفق مؤشرات أداء واضحة",
            ],
          },
          ...(includeCharts
            ? [
                {
                  kind: "chart" as const,
                  level: 0,
                  text: "",
                  chart: {
                    kind: "bar" as const,
                    title: `مؤشرات نمو ${subject}`,
                    categories: ["ر1", "ر2", "ر3", "ر4"],
                    values: [45, 72, 108, 145],
                    unit: "pts",
                  },
                },
              ]
            : []),
          {
            kind: "heading",
            level: 2,
            text: "2. جدول التنفيذ ومؤشرات القياس",
          },
          {
            kind: "table",
            level: 0,
            text: "",
            rows: [
              ["المرحلة", "التركيز الرئيسي", "مؤشر النجاح"],
              ["المرحلة الأولى", `إطلاق النطاق الأساسي لـ ${subject}`, "جاهزية القوالب خلال أسبوعين"],
              ["المرحلة الثانية", "تفعيل الفرق وربط المؤشرات", "توفير 65% من وقت الإعداد"],
              ["المرحلة الثالثة", "التوسع والتقارير الدورية", "تغطية شاملة لوحدات العمل"],
            ],
          },
          {
            kind: "paragraph",
            level: 0,
            text: "يمثل هذا المسار خارطة طريق عملية تضمن تحقيق أثر قابل للقياس منذ الشهر الأول للتطبيق.",
          },
          {
            kind: "quote",
            level: 0,
            text: "الوضوح في الهيكلة ودقة البيانات هما الأساس لأي قرار تنفيذي ناجح.",
          },
        ]
      : [
          {
            kind: "heading",
            level: 1,
            text: bilingual ? `${subject} | Executive Brief` : `${subject} — Strategic Brief`,
          },
          {
            kind: "paragraph",
            level: 0,
            text: `This document outlines the strategy, operating model, and measurable outcomes for ${subject}, tailored for ${audience || "executive stakeholders"}.`,
          },
          {
            kind: "heading",
            level: 2,
            text: bilingual ? "1. Context & Opportunity | السياق والفرصة" : "1. Context & Opportunity",
          },
          {
            kind: "paragraph",
            level: 0,
            text: `High-performing teams require a structured workflow that connects raw insights, visual charts, and bilingual deliverables around ${subject} without manual reformatting.`,
          },
          {
            kind: "list",
            level: 0,
            text: "",
            ordered: false,
            items: [
              `Standardize executive storytelling and visual consistency for ${subject}`,
              "Eliminate manual copy-paste bottlenecks between analytics and Word/PowerPoint",
              "Track adoption, cycle-time savings, and quality benchmarks weekly",
            ],
          },
          ...(includeCharts
            ? [
                {
                  kind: "chart" as const,
                  level: 0,
                  text: "",
                  chart: {
                    kind: "bar" as const,
                    title: `${subject} — Quarterly Performance Index`,
                    categories: ["Q1", "Q2", "Q3", "Q4"],
                    values: [64, 88, 118, 152],
                    unit: "pts",
                  },
                },
              ]
            : []),
          {
            kind: "heading",
            level: 2,
            text: bilingual ? "2. Execution Roadmap | خارطة التنفيذ" : "2. Execution Roadmap & KPIs",
          },
          {
            kind: "table",
            level: 0,
            text: "",
            rows: [
              ["Phase", "Primary Focus", "Success Metric"],
              ["Phase 1", `Align ${subject} scope and templates`, "100% stakeholder sign-off"],
              ["Phase 2", "Deploy workflows & live chart exports", "60%+ reduction in prep time"],
              ["Phase 3", "Scale across regional & global teams", "Sustained weekly active usage"],
            ],
          },
          {
            kind: "paragraph",
            level: 0,
            text: "Following these three milestones gives leadership clear visibility into ROI, team velocity, and long-term scalability.",
          },
          {
            kind: "quote",
            level: 0,
            text: "Structured clarity turns complex data into confident executive decisions.",
          },
        ];

    return {
      title: `${subject} — ${isAr ? "مستند تنفيذي" : "Executive Brief"}`.slice(0, 180),
      language,
      blocks,
    };
  }

  async editText(input: EditInput): Promise<{ text: string }> {
    const clean = input.text.trim();
    if (!clean) return { text: "" };

    switch (input.operation) {
      case "shorten": {
        const firstSentence = clean.split(/(?<=[.!?؟])\s+/)[0] ?? clean;
        return {
          text:
            firstSentence.length > 120 ? `${firstSentence.slice(0, 117).trim()}…` : firstSentence,
        };
      }
      case "expand": {
        const isAr = /[\u0600-\u06FF]/.test(clean);
        return {
          text: isAr
            ? `${clean} — مدعوم بمؤشرات قياس واضحة وخطوات تنفيذ مرحلية قابلة للمتابعة.`
            : `${clean} — backed by measurable KPIs, clear ownership, and phased execution milestones.`,
        };
      }
      case "translate": {
        if (input.targetLang === "ar") {
          return { text: `النسخة العربية: ${clean}` };
        }
        return { text: `Demo translation (EN): ${clean}` };
      }
      case "tone": {
        return { text: clean.replace(/\s+/g, " ").replace(/!+/g, ".") };
      }
      case "rewrite":
      default: {
        const words = clean.split(/\s+/);
        if (words.length <= 3) return { text: clean };
        return { text: clean.charAt(0).toUpperCase() + clean.slice(1) };
      }
    }
  }
}
