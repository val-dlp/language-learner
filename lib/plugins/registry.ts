export const plugins = [
    {
        id: "vocabulary",
        title: "Vocabulary",
        description:
            "Practice a prepared lesson with quick feedback on your own words.",
        route: "/vocabulary",
        input: "A prepared ten-question lesson",
        namespace: "plugins/vocabulary",
    },
    {
        id: "reading",
        title: "Reading",
        description: "Read at your own pace and discuss passages in context.",
        route: "/reading",
        input: "A PDF, Markdown, or text file",
        namespace: "plugins/reading",
    },
] as const;
