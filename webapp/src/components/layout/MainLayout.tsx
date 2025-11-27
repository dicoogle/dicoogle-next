import { ReactNode } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/AuthStore'
import { Button } from '@/components/ui/Button'
import { Activity, Search, LogOut, User } from 'lucide-react'

interface MainLayoutProps {
  children: ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and title */}
            <Link to="/search" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <div className="flex items-center justify-center w-10 h-10 bg-primary-600 rounded-lg">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  Dicoogle Next
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">Medical Imaging PACS</p>
              </div>
            </Link>

            {/* Navigation */}
            <nav className="flex items-center space-x-4">
              <Link to="/search">
                <Button variant="ghost" size="sm">
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
              </Link>

              {/* User menu */}
              {user && (
                <div className="flex items-center space-x-3 pl-4 border-l border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {user.username}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </div>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Powered by{' '}
            <a
              href="https://www.dicoogle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Dicoogle Open Source PACS
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}