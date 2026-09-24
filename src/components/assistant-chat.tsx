"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AssistantFacts } from "./assistant-facts";
import type {
  AssistantApiResponse,
  AssistantEventReference,
  AuthoritativeFacts,
  GroundingStatus,
} from "@/lib/assistant/types";

interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  text: string;
  events?: AssistantEventReference[];
  facts?: AuthoritativeFacts;
  grounding?: {
    status: GroundingStatus;
    toolsUsed: string[];
    notice?: string;
  };
}

const STARTER_PROMPTS = [
  "Hackathons fitting my profile",
  "Which saved events have upcoming deadlines?",
  "Show online workshops for Python",
  "What can you help me with?",
];

export function AssistantChat() {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; retryPrompt?: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageCounterRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const sendMessage = async (promptToSend: string) => {
    const text = promptToSend.trim();
    if (!text || loading) return;

    setError(null);
    setInput("");

    messageCounterRef.current += 1;
    const userMessageId = `user-${messageCounterRef.current}`;
    const newMessages: ChatMessageItem[] = [
      ...messages,
      { id: userMessageId, role: "user", text },
    ];
    setMessages(newMessages);
    setLoading(true);

    try {
      // Build untrusted history: up to 6 messages, strictly user and assistant roles
      const historyPayload = newMessages.slice(-6).map((m) => ({
        role: m.role,
        content: m.text,
      }));

      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
        }),
      });

      const data: AssistantApiResponse = await res.json();

      if (!data.ok) {
        let msg = data.message || "An error occurred while contacting the assistant.";
        if (data.code === "rate_limited") {
          msg = data.retryAfterSeconds
            ? `Rate limit reached. Please wait ${data.retryAfterSeconds} seconds before your next message.`
            : "Rate limit reached. Please wait a moment before sending another message.";
        }
        setError({ message: msg, retryPrompt: text });
      } else {
        messageCounterRef.current += 1;
        const assistantMessageId = `asst-${messageCounterRef.current}`;
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMessageId,
            role: "assistant",
            text: data.answer,
            events: data.events,
            facts: data.facts,
            grounding: data.grounding,
          },
        ]);
      }
    } catch {
      setError({
        message: "Network or server error. Please check your connection and retry.",
        retryPrompt: text,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col space-y-6">
      {/* Header and Truth/Privacy Disclosure Banner */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Grounded AI Assistant
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask questions about opportunities, deadlines, eligibility, and recommendations.
            </p>
          </div>
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearChat}>
              Clear conversation
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground leading-relaxed">
          <p className="font-semibold text-foreground">Authoritative Grounding &amp; Data Privacy</p>
          <p className="mt-1">
            Answers are grounded strictly in canonical database records. The assistant never manufactures
            unverified events, dates, deadlines, eligibility criteria, or recommendation rankings. Only
            minimized academic level, graduation year, and technical skills from your profile are evaluated
            for eligibility; your name, email, and institution are never sent to model providers. Official
            organizer rules remain authoritative.
          </p>
        </div>
      </div>

      {/* Chat Messages Container */}
      <div className="min-h-[380px] rounded-lg border border-border bg-card p-4 sm:p-6 flex flex-col justify-between">
        {messages.length === 0 ? (
          <div className="my-auto py-8 text-center">
            <p className="text-base font-medium text-foreground">
              How can I help you find opportunities today?
            </p>
            <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
              Select an example question below or type your own question about technology competitions,
              deadlines, or eligibility.
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="rounded-full border border-border bg-background px-3.5 py-1.5 text-xs text-foreground hover:bg-muted hover:border-foreground/30 transition text-left cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                {/* Role Label */}
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  {msg.role === "user" ? "You" : "Assistant"}
                </span>

                {/* Message Bubble */}
                <div
                  className={`max-w-2xl rounded-lg px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 border border-border text-foreground w-full"
                  }`}
                >
                  {/* Plain Safe Text Display */}
                  <div className="whitespace-pre-line break-words">{msg.text}</div>

                  {/* Grounding Status and Tools Meta (Assistant Only) */}
                  {msg.grounding && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-border/60 text-xs">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                          msg.grounding.status === "grounded"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : msg.grounding.status === "partial"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : msg.grounding.status === "no_results"
                            ? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                        }`}
                      >
                        {msg.grounding.status === "grounded" && "Grounded in database facts"}
                        {msg.grounding.status === "partial" && "Partial canonical data"}
                        {msg.grounding.status === "no_results" && "No matching results in database"}
                        {msg.grounding.status === "not_applicable" && "General answer"}
                      </span>

                      {msg.grounding.toolsUsed.length > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          Tools: {msg.grounding.toolsUsed.join(", ")}
                        </span>
                      )}

                      {msg.grounding.notice && (
                        <p className="w-full text-[11px] text-muted-foreground italic mt-0.5">
                          {msg.grounding.notice}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Authoritative Facts (Eligibility, Matrix, Deadlines, Recs) */}
                  {msg.facts && <AssistantFacts facts={msg.facts} />}

                  {/* Referenced Canonical Event Cards (No Save Toggle) */}
                  {msg.events && msg.events.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Referenced Canonical Opportunities
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {msg.events.map((event) => (
                          <div
                            key={event.id}
                            className="rounded-md border border-border bg-card p-3 space-y-2 text-xs flex flex-col justify-between"
                          >
                            <div className="space-y-1">
                              <p className="text-[11px] text-primary">
                                {event.categoryName || "Category not specified"} ·{" "}
                                {event.mode || "Mode not specified"}
                              </p>
                              <Link
                                href={`/events/${event.slug}`}
                                className="font-semibold text-sm hover:underline block text-foreground leading-snug"
                              >
                                {event.title}
                              </Link>
                              <p className="text-muted-foreground text-[11px]">
                                {event.organizerName || "Organizer not specified"}
                              </p>
                            </div>

                            <dl className="mt-2 space-y-1 border-t border-border pt-2 text-[11px]">
                              {event.datesSummary && (
                                <div>
                                  <dt className="inline text-muted-foreground">Dates: </dt>
                                  <dd className="inline text-foreground">{event.datesSummary}</dd>
                                </div>
                              )}
                              {event.deadlineSummary && (
                                <div>
                                  <dt className="inline text-muted-foreground">Deadline: </dt>
                                  <dd className="inline text-foreground">{event.deadlineSummary}</dd>
                                </div>
                              )}
                              {event.verificationLevel && (
                                <div>
                                  <dt className="inline text-muted-foreground">Verification: </dt>
                                  <dd className="inline font-medium uppercase text-foreground">
                                    {event.verificationLevel}
                                  </dd>
                                </div>
                              )}
                            </dl>

                            <div className="pt-2">
                              <Link
                                href={`/events/${event.slug}`}
                                className="inline-block text-xs font-medium text-primary underline underline-offset-4 hover:opacity-80"
                              >
                                View full details &rarr;
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* In-Flight Indicator */}
            {loading && (
              <div
                className="flex items-center gap-2 text-xs text-muted-foreground"
                aria-live="polite"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-primary animate-ping" />
                <span>Searching database and grounding response...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error / Rate Limit Banner */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="font-medium">{error.message}</p>
          {error.retryPrompt && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendMessage(error.retryPrompt!)}
              disabled={loading}
              className="border-red-300 text-red-900 dark:border-red-800 dark:text-red-200"
            >
              Retry
            </Button>
          )}
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about opportunities, deadlines, or your profile eligibility..."
          disabled={loading}
          rows={2}
          className="min-h-12 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        <Button
          type="submit"
          disabled={loading || !input.trim()}
          className="sm:self-stretch px-6"
        >
          {loading ? "Searching..." : "Send"}
        </Button>
      </form>
    </div>
  );
}
