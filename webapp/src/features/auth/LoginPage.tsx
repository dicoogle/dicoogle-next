import { useState, FormEvent, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/AuthStore";
import { AlertCircle, Loader2 } from "lucide-react";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const loginAttemptedRef = useRef(false);

  const { isAuthenticated, loading, error, login } = useAuthStore();

  // Only redirect if:
  // 1. User is authenticated
  // 2. AND they just attempted to login (not on initial page load)
  useEffect(() => {
    if (isAuthenticated && loginAttemptedRef.current) {
      // Get the redirect path from location state or default to /search
      const from = (location.state as any)?.from?.pathname || "/search";
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    loginAttemptedRef.current = true;
    await login({ username, password });
  };

  // If already authenticated on initial load, redirect immediately
  if (isAuthenticated && !loginAttemptedRef.current) {
    const from = (location.state as any)?.from?.pathname || "/search";
    navigate(from, { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md">
        {/* Logo and branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-lg h-32 rounded-2xl mb-4">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Dicoogle Logo"
            />
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Medical Imaging PACS Platform
          </p>
        </div>

        {/* Login Card */}
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to access the platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  <p className="text-sm text-red-700 dark:text-red-400">
                    You have entered an invalid username or password
                  </p>
                </div>
              )}

              {/* Username field */}
              <div className="space-y-2">
                <label
                  htmlFor="username"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Username
                </label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="username"
                  autoFocus
                />
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="current-password"
                />
              </div>

              {/* Submit button */}
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !username || !password}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            {/* Footer */}
            <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
              <p>Powered by Dicoogle Open Source PACS</p>
            </div>
          </CardContent>
        </Card>

        {/* Additional info */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Need help? Contact your system administrator
          </p>
        </div>
      </div>
    </div>
  );
}
