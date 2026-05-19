import { useEffect, useMemo, useState } from "react";
import { X, User, KeyRound, Save, Printer, ChevronDown } from "lucide-react";
import { changeCurrentUserPassword, updateCurrentUserProfile } from "../firebase/auth";

const mapAuthError = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "");

  if (code.includes("wrong-password")) return "Невірний поточний пароль";
  if (code.includes("requires-recent-login")) return "Потрібно повторно увійти в систему та спробувати ще раз";
  if (code.includes("invalid-email")) return "Некоректний формат email";
  if (code.includes("email-already-in-use")) return "Цей email уже використовується";
  if (code.includes("weak-password")) return "Новий пароль занадто слабкий";
  if (code.includes("requires-current-password")) return "Для зміни email введіть поточний пароль";

  return message || "Не вдалося виконати операцію";
};

export default function ProfileSettingsModal({ open, onClose, user }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [printerIp, setPrinterIp] = useState("");
  const [printerPort, setPrinterPort] = useState("9100");
  const [printerOffsetX, setPrinterOffsetX] = useState("0");
  const [printerSaved, setPrinterSaved] = useState(false);

  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [activeSection, setActiveSection] = useState("password");

  useEffect(() => {
    if (!open) return;
    setDisplayName(String(user?.displayName || ""));
    setEmail(String(user?.email || ""));
    setCurrentPasswordForEmail("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setProfileMessage("");
    setProfileError("");
    setPasswordMessage("");
    setPasswordError("");
    setActiveSection("password");
    setPrinterIp(localStorage.getItem("lucia_printer_ip") || "");
    setPrinterPort(localStorage.getItem("lucia_printer_port") || "9100");
    setPrinterOffsetX(localStorage.getItem("lucia_printer_offset_x") || "0");
    setPrinterSaved(false);
  }, [open, user]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  const isEmailChanged = useMemo(() => {
    return String(email || "").trim() !== String(user?.email || "").trim();
  }, [email, user]);

  if (!open) return null;

  const sectionTitleClass = "flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2.5 text-left transition hover:border-slate-600 hover:bg-slate-800";
  const sectionBodyClass = "mt-2 rounded-xl border border-slate-700 bg-slate-800/50 p-4";

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setProfileMessage("");
    setProfileError("");

    try {
      setSavingProfile(true);
      await updateCurrentUserProfile({
        displayName,
        email,
        currentPassword: currentPasswordForEmail,
      });
      setCurrentPasswordForEmail("");
      setProfileMessage("Профіль успішно оновлено");
    } catch (error) {
      setProfileError(mapAuthError(error));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");

    if (newPassword.length < 6) {
      setPasswordError("Новий пароль має містити щонайменше 6 символів");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Підтвердження пароля не співпадає");
      return;
    }

    try {
      setSavingPassword(true);
      await changeCurrentUserPassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Пароль успішно змінено");
    } catch (error) {
      setPasswordError(mapAuthError(error));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-t-2xl sm:rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sm:hidden mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-600" />

        <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-slate-700 bg-slate-900/95 backdrop-blur">
          <div>
            <h3 className="text-base sm:text-lg font-semibold">Профіль та безпека</h3>
            <p className="text-xs text-slate-400">Швидкі налаштування без зайвого скролу</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg p-2.5 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
          <section>
            <button
              type="button"
              className={sectionTitleClass}
              onClick={() => setActiveSection((prev) => (prev === "account" ? "" : "account"))}
            >
              <span className="flex items-center gap-2 text-indigo-300">
                <User size={16} />
                <span className="font-semibold">Дані облікового запису</span>
              </span>
              <ChevronDown
                size={18}
                className={`text-slate-400 transition-transform ${activeSection === "account" ? "rotate-180" : ""}`}
              />
            </button>

            {activeSection === "account" && (
              <form onSubmit={handleSaveProfile} className={`${sectionBodyClass} space-y-3`}>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Прізвище та ім'я</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {isEmailChanged && (
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Поточний пароль (для зміни email)</label>
                    <input
                      type="password"
                      value={currentPasswordForEmail}
                      onChange={(e) => setCurrentPasswordForEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}

                {profileError && <p className="text-sm text-rose-400">{profileError}</p>}
                {profileMessage && <p className="text-sm text-emerald-400">{profileMessage}</p>}

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                >
                  <Save size={16} />
                  {savingProfile ? "Збереження..." : "Зберегти профіль"}
                </button>
              </form>
            )}
          </section>

          <section>
            <button
              type="button"
              className={sectionTitleClass}
              onClick={() => setActiveSection((prev) => (prev === "password" ? "" : "password"))}
            >
              <span className="flex items-center gap-2 text-amber-300">
                <KeyRound size={16} />
                <span className="font-semibold">Зміна пароля</span>
              </span>
              <ChevronDown
                size={18}
                className={`text-slate-400 transition-transform ${activeSection === "password" ? "rotate-180" : ""}`}
              />
            </button>

            {activeSection === "password" && (
              <form onSubmit={handleChangePassword} className={`${sectionBodyClass} space-y-3`}>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Поточний пароль</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-1">Новий пароль</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-1">Підтвердіть новий пароль</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {passwordError && <p className="text-sm text-rose-400">{passwordError}</p>}
                {passwordMessage && <p className="text-sm text-emerald-400">{passwordMessage}</p>}

                <button
                  type="submit"
                  disabled={savingPassword}
                  className="inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-60"
                >
                  <KeyRound size={16} />
                  {savingPassword ? "Зміна..." : "Змінити пароль"}
                </button>
              </form>
            )}
          </section>

          <section>
            <button
              type="button"
              className={sectionTitleClass}
              onClick={() => setActiveSection((prev) => (prev === "printer" ? "" : "printer"))}
            >
              <span className="flex items-center gap-2 text-cyan-300">
                <Printer size={16} />
                <span className="font-semibold">Мережевий принтер етикеток</span>
              </span>
              <ChevronDown
                size={18}
                className={`text-slate-400 transition-transform ${activeSection === "printer" ? "rotate-180" : ""}`}
              />
            </button>

            {activeSection === "printer" && (
              <div className={`${sectionBodyClass} space-y-3`}>
                <p className="text-xs text-slate-400">
                  Вкажіть IP-адресу принтера для прямого друку QR-етикеток без діалогу друку (TSPL, порт 9100).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">IP-адреса принтера</label>
                    <input
                      type="text"
                      value={printerIp}
                      onChange={(e) => { setPrinterIp(e.target.value); setPrinterSaved(false); }}
                      placeholder="192.168.1.100"
                      className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Порт</label>
                    <input
                      type="text"
                      value={printerPort}
                      onChange={(e) => { setPrinterPort(e.target.value); setPrinterSaved(false); }}
                      placeholder="9100"
                      className="w-full sm:w-24 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Зсув X (dots)</label>
                    <input
                      type="number"
                      value={printerOffsetX}
                      onChange={(e) => { setPrinterOffsetX(e.target.value); setPrinterSaved(false); }}
                      placeholder="0"
                      className="w-full sm:w-24 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                {printerSaved && <p className="text-sm text-emerald-400">Налаштування принтера збережено</p>}

                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem("lucia_printer_ip", printerIp.trim());
                    localStorage.setItem("lucia_printer_port", String(printerPort || "9100").trim());
                    localStorage.setItem("lucia_printer_offset_x", String(printerOffsetX || "0").trim());
                    setPrinterSaved(true);
                  }}
                  className="inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
                >
                  <Save size={16} />
                  Зберегти принтер
                </button>
              </div>
            )}
          </section>

          <div className="sticky bottom-0 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-2 pb-1 bg-gradient-to-t from-slate-900 via-slate-900 to-transparent">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
            >
              Готово
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
