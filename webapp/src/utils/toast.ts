// Simple toast notification utility

type ToastType = 'success' | 'error' | 'info';

interface ToastOptions {
  duration?: number;
  onClick?: () => void;
}

function createToast(message: string | React.ReactNode, type: ToastType, options: ToastOptions = {}) {
  const { duration = 4000, onClick } = options;
  
  const toast = document.createElement('div');
  toast.className = `fixed top-4 right-4 z-50 max-w-md p-4 rounded-lg shadow-lg animate-slide-in-right transition-all ${
    type === 'success'
      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
      : type === 'error'
      ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
      : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
  }`;

  if (onClick) {
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', onClick);
  }

  // Handle React nodes or plain strings
  if (typeof message === 'string') {
    toast.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="flex-1">
          ${message}
        </div>
        <button class="text-current opacity-50 hover:opacity-100" onclick="this.parentElement.parentElement.remove()">
          ✕
        </button>
      </div>
    `;
  } else {
    // For React nodes, we'll use a simpler approach
    const messageStr = String(message);
    toast.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="flex-1">
          ${messageStr}
        </div>
        <button class="text-current opacity-50 hover:opacity-100" onclick="this.parentElement.parentElement.remove()">
          ✕
        </button>
      </div>
    `;
  }

  document.body.appendChild(toast);

  // Auto dismiss
  if (duration > 0) {
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return toast;
}

export const toast = {
  success: (message: string, options?: ToastOptions) => createToast(message, 'success', options),
  error: (message: string, options?: ToastOptions) => createToast(message, 'error', options),
  info: (message: string, options?: ToastOptions) => createToast(message, 'info', options),
};
