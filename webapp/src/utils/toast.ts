import { toast as sonnerToast } from "sonner";

export const toast = {
  success: (message: string | React.ReactNode) => {
    sonnerToast.success(message);
  },
  error: (message: string | React.ReactNode) => {
    sonnerToast.error(message);
  },
  warning: (
    message: string | React.ReactNode,
    options?: { duration?: number },
  ) => {
    sonnerToast.warning(message, options);
  },
  info: (message: string | React.ReactNode) => {
    sonnerToast.info(message);
  },
  loading: (message: string | React.ReactNode, id?: string | number) => {
    if (id) {
      return sonnerToast.loading(message, { id });
    }
    return sonnerToast.loading(message);
  },
  dismiss: (id?: string | number) => {
    sonnerToast.dismiss(id);
  },
  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string;
      error: string;
    },
  ) => {
    return sonnerToast.promise(promise, messages);
  },
};
