import { useMemo, useState } from "react";
import { CalendarDays, Paperclip, Scale, Send, X } from "lucide-react";
import { LEGAL_PRIORITIES } from "../data/legalConstants";

const inputClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100";
const MAX_FILES = 6;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const toDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function LegalRequestModal({ user, restaurants = [], createTask, onSuccess, onClose }) {
  const [form, setForm] = useState({ title: "", description: "", preferredDeadline: "", priority: "normal", restaurantId: user?.restaurant || "", contact: "" });
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const selectedRestaurant = useMemo(() => restaurants.find((item) => String(item.id) === String(form.restaurantId)), [restaurants, form.restaurantId]);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const selectFiles = async (event) => {
    const selected = Array.from(event.target.files || []).slice(0, MAX_FILES - files.length);
    if (selected.some((file) => file.size > MAX_FILE_SIZE)) {
      alert("Кожен файл має бути до 5 MB.");
      return;
    }
    try {
      const encoded = await Promise.all(selected.map(async (file) => ({ name: file.name, type: file.type, size: file.size, dataUrl: await toDataUrl(file) })));
      setFiles((current) => [...current, ...encoded]);
      event.target.value = "";
    } catch {
      alert("Не вдалося додати файл.");
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      alert("Заповніть тему задачі та опис.");
      return;
    }
    setSubmitting(true);
    const result = await createTask({ ...form, title: form.title.trim(), description: form.description.trim(), attachments: files, restaurantName: selectedRestaurant?.name || "" });
    setSubmitting(false);
    if (!result?.success) {
      alert("Не вдалося надіслати запит юристу. Спробуйте ще раз.");
      return;
    }
    onSuccess?.(result, form);
  };

  return <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form onSubmit={submit} className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white"><div><div className="flex items-center gap-2"><Scale size={20} /><h2 className="text-lg font-bold">Запит до Юриста</h2></div><p className="mt-1 text-sm text-indigo-100">Заповніть юридичну заявку. Вона одразу з'явиться у Legal TODO.</p></div><button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white" title="Закрити"><X size={20} /></button></div>
      <div className="grid gap-4 p-5 sm:grid-cols-2"><label className="sm:col-span-2 text-sm font-semibold text-slate-800">Тема задачі *<input autoFocus value={form.title} onChange={(event) => set("title", event.target.value)} className={inputClass} placeholder="Напр. Перевірити договір оренди" /></label><label className="sm:col-span-2 text-sm font-semibold text-slate-800">Опис *<textarea value={form.description} onChange={(event) => set("description", event.target.value)} className={`${inputClass} min-h-[110px] resize-y`} placeholder="Стисло опишіть суть запиту, сторони, контекст..." /></label><label className="text-sm font-semibold text-slate-800">Бажаний дедлайн<div className="relative"><input type="date" value={form.preferredDeadline} onChange={(event) => set("preferredDeadline", event.target.value)} className={inputClass} /><CalendarDays size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /></div></label><label className="text-sm font-semibold text-slate-800">Пріоритет<select value={form.priority} onChange={(event) => set("priority", event.target.value)} className={inputClass}>{LEGAL_PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="text-sm font-semibold text-slate-800">Ресторан / підрозділ<select value={form.restaurantId} onChange={(event) => set("restaurantId", event.target.value)} className={inputClass}><option value="">Не вказано</option>{restaurants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-semibold text-slate-800">Контакт для зв'язку<input value={form.contact} onChange={(event) => set("contact", event.target.value)} className={inputClass} placeholder="Телефон / e-mail" /></label><div className="sm:col-span-2"><p className="text-sm font-semibold text-slate-800">Файли</p><label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 hover:border-indigo-400 hover:bg-indigo-50"><Paperclip size={16} /> Додати файли (до {MAX_FILES}, кожен до 5 MB)<input type="file" multiple className="hidden" onChange={selectFiles} /></label>{files.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{files.map((file, index) => <span key={`${file.name}-${index}`} className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">{file.name}</span>)}</div>}</div></div>
      <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Скасувати</button><button disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"><Send size={16} />{submitting ? "Надсилання..." : "Надіслати юристу"}</button></div>
    </form>
  </div>;
}