import {
  Component,
  type ErrorInfo,
  type ReactNode,
  lazy,
  Suspense,
  useState,
} from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DicomViewerProps } from "@/types";

const createDicomViewerComponent = () =>
  lazy(() =>
    import("./CornerstoneViewport").then((module) => ({
      default: module.DicomViewer,
    }))
  );

interface LazyLoadErrorBoundaryProps {
  children: ReactNode;
  onRetry: () => void;
  onClose?: () => void;
}

interface LazyLoadErrorBoundaryState {
  error: Error | null;
}

class LazyLoadErrorBoundary extends Component<
  LazyLoadErrorBoundaryProps,
  LazyLoadErrorBoundaryState
> {
  state: LazyLoadErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): LazyLoadErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[DicomViewerLazy] Failed to load lazy viewer", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 bg-black z-100 flex items-center justify-center">
          <div className="bg-red-900/20 border border-red-800 p-6 rounded-lg text-center max-w-md mx-4">
            <p className="text-red-400 font-semibold mb-2">Error Loading Viewer</p>
            <p className="text-red-300 text-sm">
              {this.state.error.message ||
                "The DICOM viewer could not be loaded. Please retry."}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                onClick={this.handleRetry}
                className="bg-red-900 hover:bg-red-800 text-white"
              >
                Retry
              </Button>
              {this.props.onClose && (
                <Button
                  variant="outline-solid"
                  onClick={this.props.onClose}
                  className="border-red-700 text-red-200 hover:bg-red-900/30"
                >
                  Close
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function DicomViewerLazy(props: DicomViewerProps) {
  const [DicomViewerComponent, setDicomViewerComponent] = useState(() =>
    createDicomViewerComponent()
  );

  return (
    <LazyLoadErrorBoundary
      onRetry={() => setDicomViewerComponent(() => createDicomViewerComponent())}
      onClose={props.onClose}
    >
      <Suspense
        fallback={
          <div className="fixed inset-0 bg-black z-100 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
              <p className="text-neutral-300 text-lg font-medium">
                Loading DICOM Viewer...
              </p>
              <p className="text-neutral-500 text-sm mt-2">
                Initializing rendering engine
              </p>
            </div>
          </div>
        }
      >
        <DicomViewerComponent {...props} />
      </Suspense>
    </LazyLoadErrorBoundary>
  );
}
