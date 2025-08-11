"use client";
import React from "react";
import ErrorState from "./ErrorState";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onRetry?: () => void;
};

type State = { hasError: boolean; message?: string };

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught error:", error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: undefined });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return <>{this.props.fallback}</>;
      return <ErrorState message={this.state.message || "Something went wrong."} onRetry={this.handleRetry} />;
    }
    return this.props.children as React.ReactElement;
  }
}

