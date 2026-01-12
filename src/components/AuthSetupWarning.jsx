import { AlertCircle, ExternalLink } from "lucide-react";

export const AuthSetupWarning = ({ onDismiss }) => {
  return (
    <div className="fixed top-20 right-6 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg shadow-lg max-w-md z-50">
      <div className="flex items-start gap-3">
        <AlertCircle className="text-yellow-600 shrink-0 mt-0.5" size={20} />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-yellow-800 mb-1">
            Authentication не налаштовано
          </h3>
          <p className="text-xs text-yellow-700 mb-3">
            Щоб користуватись системою входу, активуйте Email/Password authentication у Firebase Console.
          </p>
          <div className="flex items-center gap-2">
            <a
              href="https://console.firebase.google.com/project/luci-f1285/authentication/providers"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-600 text-white text-xs font-medium rounded hover:bg-yellow-700 transition"
            >
              Відкрити Firebase Console
              <ExternalLink size={12} />
            </a>
            <button
              onClick={onDismiss}
              className="px-3 py-1.5 text-xs font-medium text-yellow-700 hover:text-yellow-900"
            >
              Закрити
            </button>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-yellow-400 hover:text-yellow-600 transition"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};
