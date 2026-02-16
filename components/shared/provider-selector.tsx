"use client";

import { Bot, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Provider = "openai" | "gemini";

const providerLabels: Record<Provider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
};

const providerIcons: Record<Provider, React.ReactNode> = {
  openai: <Bot className="h-3.5 w-3.5" />,
  gemini: <Sparkles className="h-3.5 w-3.5" />,
};

interface ProviderSelectorProps {
  value: Provider;
  onChange: (provider: Provider) => void;
  disabled?: boolean;
}

export function ProviderSelector({
  value,
  onChange,
  disabled,
}: ProviderSelectorProps) {
  const [available, setAvailable] = useState<Provider[]>([]);

  useEffect(() => {
    fetch("/api/providers")
      .then((res) => res.json())
      .then((data) => {
        setAvailable(data.available || []);
      })
      .catch(() => {
        // Default to current value if fetch fails
        setAvailable([value]);
      });
  }, [value]);

  // Only show selector if multiple providers are available
  if (available.length <= 1) {
    return null;
  }

  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as Provider)}
      disabled={disabled}
    >
      <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-transparent px-2 text-muted-foreground text-xs shadow-none hover:bg-gray-100 focus:ring-0 dark:hover:bg-gray-800">
        {providerIcons[value]}
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        {available.map((provider) => (
          <SelectItem key={provider} value={provider}>
            <span className="flex items-center gap-1.5">
              {providerIcons[provider]}
              {providerLabels[provider]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function useProviderSelection() {
  const [provider, setProvider] = useState<Provider>("openai");

  // Initialize from server-side default
  useEffect(() => {
    fetch("/api/providers")
      .then((res) => res.json())
      .then((data) => {
        if (data.active) {
          setProvider(data.active);
        }
      })
      .catch(() => {
        // Keep default
      });
  }, []);

  return { provider, setProvider };
}
