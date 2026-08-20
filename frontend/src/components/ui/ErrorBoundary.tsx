import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
 children: ReactNode;
 fallback?: ReactNode;
 /** Optional label shown in the error UI to identify which area failed */
 area?: string;
}

interface State {
 hasError: boolean;
 error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
 constructor(props: Props) {
 super(props);
 this.state = { hasError: false, error: null };
 }

 static getDerivedStateFromError(error: Error): State {
 return { hasError: true, error };
 }

 componentDidCatch(error: Error, info: ErrorInfo) {
 console.error(`[ErrorBoundary${this.props.area ? ` — ${this.props.area}` : ""}]`, error, info.componentStack);
 }

 handleReset = () => {
 this.setState({ hasError: false, error: null });
 };

 render() {
 if (this.state.hasError) {
 if (this.props.fallback) return this.props.fallback;

 return (
 <div
 style={{
 display: "flex",
 flexDirection: "column",
 alignItems: "center",
 justifyContent: "center",
 gap: "12px",
 padding: "32px",
 color: "var(--text-secondary)",
 background: "rgba(248,113,113,0.06)",
 border: "1px solid rgba(248,113,113,0.2)",
 borderRadius: "8px",
 margin: "16px",
 }}
 >
 <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#f87171", opacity: 0.8 }}>
 <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
 </svg>
 <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
 {this.props.area ? `${this.props.area} crashed` : "Something went wrong"}
 </p>
 {this.state.error && (
 <p style={{ fontSize: "11px", color: "var(--text-muted)", maxWidth: "320px", textAlign: "center" }}>
 {this.state.error.message}
 </p>
 )}
 <button
 onClick={this.handleReset}
 style={{
 padding: "6px 14px",
 fontSize: "11px",
 fontWeight: 600,
 borderRadius: "4px",
 border: "1px solid rgba(248,113,113,0.4)",
 background: "rgba(248,113,113,0.12)",
 color: "#f87171",
 cursor: "pointer",
 }}
 >
 Try again
 </button>
 </div>
 );
 }

 return this.props.children;
 }
}
