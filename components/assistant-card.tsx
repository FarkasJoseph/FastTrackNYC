type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export function AssistantCard({
  questions,
  messages,
  onQuestionClick,
  activeRouteLabel,
}: {
  questions: string[];
  messages: Message[];
  onQuestionClick: (question: string) => void;
  activeRouteLabel: string;
}) {
  return (
    <div className="glass-panel rounded-[34px] p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-[var(--teal)]">
            Route guide
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
            Grounded assistant
          </h2>
        </div>
        <div className="rounded-full border border-[var(--line)] px-3 py-2 text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
          Focused on {activeRouteLabel.toLowerCase()}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {messages.slice(-4).map((message) => (
          <div
            key={message.id}
            className={`rounded-[24px] px-4 py-4 text-sm leading-6 ${
              message.role === "assistant"
                ? "bg-[rgba(255,255,255,0.04)] text-[var(--muted)]"
                : "ml-auto max-w-[90%] bg-[rgba(102,225,218,0.14)] text-white"
            }`}
          >
            {message.content}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {questions.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onQuestionClick(question)}
            className="rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-4 py-2 text-sm text-[var(--muted)] transition hover:border-[rgba(102,225,218,0.44)] hover:text-white"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
