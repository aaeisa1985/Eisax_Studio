import type { DocumentContent, PresentationContent } from "@/lib/validation/projects";

export interface StarterTemplate {
  id: string;
  type: "presentation" | "document";
  language: "en" | "ar";
  nameEn: string;
  nameAr: string;
  descEn: string;
  descAr: string;
  content: PresentationContent | DocumentContent;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "pitch-deck",
    type: "presentation",
    language: "en",
    nameEn: "Startup Pitch Deck",
    nameAr: "عرض مشروع ناشئ",
    descEn: "Problem, solution, traction & ask in 5 clean slides.",
    descAr: "المشكلة، الحل، النموذج التجاري، والخطوة القادمة في 5 شرائح.",
    content: {
      schemaVersion: 1,
      theme: "obsidian",
      slides: [
        {
          id: "t-p1",
          title: "Company Name — Pitch Deck",
          subtitle: "Clear one-line value proposition",
          bullets: [],
          layout: "title",
          accentShape: "badge",
          notes: "Introduce the team and mission in 20 seconds.",
          dir: "ltr",
        },
        {
          id: "t-p2",
          title: "The Problem",
          subtitle: "Why existing workflows fall short",
          bullets: [
            "Time lost on manual formatting and fragmented tools",
            "High cost or steep learning curve for small teams",
            "Poor bilingual or regional workflow support",
          ],
          layout: "title-body",
          accentShape: "bar",
          notes: "Share one concrete customer pain point.",
          dir: "ltr",
        },
        {
          id: "t-p3",
          title: "Our Solution",
          subtitle: "Fast, structured, and editable from day one",
          bullets: [
            "Natural-language input to structured output",
            "Full visual editing with instant undo & revisions",
            "Native editable exports (PPTX, DOCX, PDF)",
            "Built-in multi-language readiness",
          ],
          layout: "two-col",
          accentShape: "card",
          notes: "Show how the product works in 3 steps.",
          dir: "ltr",
        },
        {
          id: "t-p4",
          title: "Traction & Roadmap",
          subtitle: "Key milestones achieved and next 6 months",
          bullets: [
            "Beta launch and initial user feedback",
            "Core export & reliability milestones completed",
            "Team collaboration & enterprise readiness next",
          ],
          layout: "title-body",
          accentShape: "bar",
          notes: "Focus on verified numbers and clear next steps.",
          dir: "ltr",
        },
        {
          id: "t-p5",
          title: "Join Us in Building What’s Next",
          subtitle: "contact@example.com",
          bullets: [],
          layout: "quote",
          accentShape: "card",
          notes: "Close with your ask and Q&A.",
          dir: "ltr",
        },
      ],
    },
  },
  {
    id: "ar-lesson",
    type: "presentation",
    language: "ar",
    nameEn: "Arabic Educational Lesson",
    nameAr: "درس تعليمي بالعربية",
    descEn: "Structured RTL lesson slides with objectives, concepts & recap.",
    descAr: "شرائح تعليمية متكاملة باتجاه RTL تشمل الأهداف والمفاهيم والخلاصة.",
    content: {
      schemaVersion: 1,
      theme: "sky",
      slides: [
        {
          id: "t-a1",
          title: "عنوان الدرس التعليمي",
          subtitle: "مقدمة مبسطة للموضوع وأهداف الجلسة",
          bullets: [],
          layout: "title",
          accentShape: "badge",
          notes: "رحّب بالطلاب واعرض سؤال البداية.",
          dir: "rtl",
        },
        {
          id: "t-a2",
          title: "أهداف التعلم",
          subtitle: "ماذا سنفهم بنهاية هذا الدرس؟",
          bullets: [
            "التعرف على المفهوم الأساسي وأهميته",
            "تحليل مثال تطبيقي خطوة بخطوة",
            "تطبيق الفكرة في تمرين عملي قصير",
          ],
          layout: "title-body",
          accentShape: "bar",
          notes: "راجع الأهداف مع الفصل قبل الانتقال للشرح.",
          dir: "rtl",
        },
        {
          id: "t-a3",
          title: "المقارنة والتطبيق",
          subtitle: "الفرق بين النهج التقليدي والنهج الحديث",
          bullets: [
            "خطوات واضحة وقابلة للقياس",
            "تركيز على الفهم لا الحفظ",
            "أمثلة من الواقع المحلي",
            "مراجعة سريعة للأخطاء الشائعة",
          ],
          layout: "two-col",
          accentShape: "card",
          notes: "اطلب من طالبين ذكر مثال مختلف.",
          dir: "rtl",
        },
      ],
    },
  },
  {
    id: "exec-report",
    type: "document",
    language: "en",
    nameEn: "Executive Summary Report",
    nameAr: "تقرير ملخص تنفيذي",
    descEn: "Structured report with headings, KPI table, bullets & callout.",
    descAr: "تقرير رسمي منظم بعناوين وجدول مؤشرات وقائمة نقاط.",
    content: {
      schemaVersion: 1,
      blocks: [
        { id: "t-d1", kind: "heading", level: 1, text: "Quarterly Executive Summary", dir: "ltr" },
        {
          id: "t-d2",
          kind: "paragraph",
          text: "**Overview:** Summarize key outcomes, operational highlights, and priorities for the upcoming quarter.",
          dir: "ltr",
        },
        { id: "t-d3", kind: "heading", level: 2, text: "Key Highlights", dir: "ltr" },
        {
          id: "t-d4",
          kind: "list",
          ordered: false,
          text: "",
          items: [
            "Delivered core milestones on schedule",
            "Improved customer onboarding completion",
            "Maintained strict reliability and security controls",
          ],
          dir: "ltr",
        },
        { id: "t-d5", kind: "heading", level: 2, text: "KPI Scorecard", dir: "ltr" },
        {
          id: "t-d6",
          kind: "table",
          text: "",
          rows: [
            ["Metric", "Target", "Actual", "Status"],
            ["Delivery velocity", "100%", "96%", "On track"],
            ["System uptime", "99.9%", "99.95%", "Exceeded"],
          ],
          dir: "ltr",
        },
        {
          id: "t-d7",
          kind: "quote",
          text: "Focus next quarter on customer retention, export quality, and team workflow speed.",
          dir: "ltr",
        },
      ],
    },
  },
  {
    id: "ar-proposal",
    type: "document",
    language: "ar",
    nameEn: "Arabic Project Proposal",
    nameAr: "مقترح مشروع احترافي",
    descEn: "Bilingual-ready RTL proposal with scope, timeline table & milestones.",
    descAr: "مقترح مشروع متكامل باللغة العربية يشمل النطاق والجدول الزمني.",
    content: {
      schemaVersion: 1,
      blocks: [
        { id: "t-ap1", kind: "heading", level: 1, text: "مقترح تنفيذ المشروع", dir: "rtl" },
        {
          id: "t-ap2",
          kind: "paragraph",
          text: "**الهدف العام:** يوضح هذا المقترح نطاق العمل والمراحل الزمنية والمخرجات المتوقعة لتنفيذ المشروع بكفاءة عالية.",
          dir: "rtl",
        },
        { id: "t-ap3", kind: "heading", level: 2, text: "نطاق العمل", dir: "rtl" },
        {
          id: "t-ap4",
          kind: "list",
          ordered: true,
          text: "",
          items: [
            "جمع المتطلبات ومراجعة الأهداف الأساسية",
            "تصميم الهيكل والمحتوى الأولي والموافقة عليه",
            "التسليم النهائي ومراجعة الجودة",
          ],
          dir: "rtl",
        },
        { id: "t-ap5", kind: "heading", level: 2, text: "الجدول الزمني المقترح", dir: "rtl" },
        {
          id: "t-ap6",
          kind: "table",
          text: "",
          rows: [
            ["المرحلة", "المدة", "المخرج"],
            ["التأسيس والتخطيط", "أسبوع واحد", "وثيقة النطاق المعتمدة"],
            ["التنفيذ والمراجعة", "أسبوعان", "النسخة الأولية الجاهزة"],
            ["الإطلاق والتسليم", "أسبوع واحد", "الملفات النهائية"],
          ],
          dir: "rtl",
        },
      ],
    },
  },
];
