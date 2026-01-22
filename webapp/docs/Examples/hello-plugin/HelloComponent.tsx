/**
 * Hello Plugin Component
 * Simple example component for the hello plugin
 */

import { useEffect, useState } from 'react';

export default function HelloComponent() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // This component demonstrates a simple plugin UI
  }, []);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Welcome to Hello Plugin</h1>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
        <p className="text-gray-700 mb-4">
          This is a simple example plugin that demonstrates the dicoogle-next
          plugin system.
        </p>

        <div className="bg-white rounded p-4 mb-4">
          <h2 className="text-xl font-semibold mb-2">Plugin Features:</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>Route extensions (this page)</li>
            <li>Sidebar menu integration</li>
            <li>Plugin initialization and lifecycle</li>
            <li>Storage context for plugin data</li>
          </ul>
        </div>
      </div>

      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Interactive Counter</h2>
        <div className="flex items-center gap-4">
          <p className="text-lg">
            Counter: <span className="font-bold text-2xl">{count}</span>
          </p>
          <button
            onClick={() => setCount(count + 1)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Increment
          </button>
          <button
            onClick={() => setCount(0)}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mt-8 p-4 bg-gray-100 rounded">
        <p className="text-sm text-gray-600">
          <strong>Note:</strong> This is a buildtime-loaded plugin. The plugin
          was discovered and imported during the build process, not at runtime.
        </p>
      </div>
    </div>
  );
}
