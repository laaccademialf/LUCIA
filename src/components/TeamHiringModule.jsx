import { useEffect, useMemo, useState } from "react";
import {
  addJobTitle,
  addRecruitmentRequest,
  deleteJobTitle,
  subscribeToJobTitles,
  subscribeToRecruitmentRequests,
  subscribeToStaffingPlans,
  updateJobTitle,
  updateRecruitmentRequest,
  upsertStaffingPlan,
} from "../firebase/staffing";

const cardClass = "card p-4 sm:p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100";

const resolveTabMode = (topTab) => {
  const key = String(topTab || "").toLowerCase();
  if (key === "mystafing") {
    return "my-staffing";
  }
  if (key === "myrequest") {
    return "requests";
  }
  if (key === "jobtitlesettings") {
    return "job-settings";
  }
  if (key === "recrutment") return "recruiter";
  return "my-staffing";
};

const monthToLabel = (value) => {
  if (!value || !value.includes("-")) return value;
  const [year, month] = value.split("-");
  return `${month}.${year}`;
};

export default function TeamHiringModule({ topTab, restaurants = [], user }) {
  const [jobTitles, setJobTitles] = useState([]);
  const [staffingPlans, setStaffingPlans] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [savingRowId, setSavingRowId] = useState("");

  const [jobForm, setJobForm] = useState({
    id: "",
    title: "",
    description: "",
    salaryFrom: "",
    salaryTo: "",
    schedule: "",
  });

  const [requestForm, setRequestForm] = useState({
    jobTitleId: "",
    quantity: 1,
    priority: "normal",
    neededBy: "",
    comment: "",
  });

  const [rowDrafts, setRowDrafts] = useState({});
  const mode = resolveTabMode(topTab);
  const canRecruiterProcess = useMemo(() => {
    const role = String(user?.role || "").toLowerCase();
    const workRole = String(user?.workRole || "").toLowerCase();
    return role === "admin" || role.includes("recruit") || workRole.includes("recruit");
  }, [user]);

  useEffect(() => {
    const unsubJobs = subscribeToJobTitles(setJobTitles);
    const unsubPlans = subscribeToStaffingPlans(setStaffingPlans);
    const unsubRequests = subscribeToRecruitmentRequests(setRequests);

    return () => {
      unsubJobs?.();
      unsubPlans?.();
      unsubRequests?.();
    };
  }, []);

  useEffect(() => {
    const fallback = user?.restaurant || restaurants[0]?.id || "";
    setSelectedRestaurantId((prev) => prev || fallback);
  }, [restaurants, user?.restaurant]);

  const currentRestaurant = useMemo(
    () => restaurants.find((item) => String(item.id) === String(selectedRestaurantId)) || null,
    [restaurants, selectedRestaurantId]
  );

  const jobsForRestaurant = useMemo(
    () => jobTitles.filter((item) => String(item.restaurantId) === String(selectedRestaurantId)),
    [jobTitles, selectedRestaurantId]
  );

  const plansForRestaurantMonth = useMemo(
    () => staffingPlans.filter((item) => String(item.restaurantId) === String(selectedRestaurantId) && String(item.month) === String(month)),
    [staffingPlans, selectedRestaurantId, month]
  );

  const requestsForRestaurant = useMemo(
    () => requests.filter((item) => String(item.restaurantId) === String(selectedRestaurantId)),
    [requests, selectedRestaurantId]
  );

  const editableRows = useMemo(() => {
    return jobsForRestaurant.map((job) => {
      const plan = plansForRestaurantMonth.find((item) => String(item.jobTitleId) === String(job.id));
      const draft = rowDrafts[job.id];
      return {
        job,
        actualCount: draft?.actualCount ?? Number(plan?.actualCount || 0),
        plannedCount: draft?.plannedCount ?? Number(plan?.plannedCount || 0),
      };
    });
  }, [jobsForRestaurant, plansForRestaurantMonth, rowDrafts]);

  const updateRowDraft = (jobId, field, value) => {
    const numericValue = Number(value);
    setRowDrafts((prev) => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        [field]: Number.isFinite(numericValue) ? numericValue : 0,
      },
    }));
  };

  const saveStaffingRow = async (jobId) => {
    const row = editableRows.find((item) => item.job.id === jobId);
    if (!row || !selectedRestaurantId) return;

    setSavingRowId(jobId);
    try {
      await upsertStaffingPlan({
        restaurantId: selectedRestaurantId,
        restaurantName: currentRestaurant?.name || "",
        month,
        jobTitleId: row.job.id,
        jobTitleName: row.job.title,
        actualCount: Number(row.actualCount || 0),
        plannedCount: Number(row.plannedCount || 0),
        updatedById: user?.uid || "",
        updatedByName: user?.name || user?.email || "",
      });
    } catch (error) {
      console.error("Помилка збереження плану:", error);
      alert("Не вдалося зберегти план по посаді");
    } finally {
      setSavingRowId("");
    }
  };

  const submitJob = async () => {
    const title = String(jobForm.title || "").trim();
    if (!title || !selectedRestaurantId) return;

    const payload = {
      restaurantId: selectedRestaurantId,
      restaurantName: currentRestaurant?.name || "",
      title,
      description: String(jobForm.description || "").trim(),
      salaryFrom: Number(jobForm.salaryFrom || 0),
      salaryTo: Number(jobForm.salaryTo || 0),
      schedule: String(jobForm.schedule || "").trim(),
      isActive: true,
    };

    try {
      if (jobForm.id) {
        await updateJobTitle(jobForm.id, payload);
      } else {
        await addJobTitle(payload);
      }
      setJobForm({ id: "", title: "", description: "", salaryFrom: "", salaryTo: "", schedule: "" });
    } catch (error) {
      console.error("Помилка збереження посади:", error);
      alert("Не вдалося зберегти посаду");
    }
  };

  const startEditJob = (item) => {
    setJobForm({
      id: item.id,
      title: item.title || "",
      description: item.description || "",
      salaryFrom: item.salaryFrom || "",
      salaryTo: item.salaryTo || "",
      schedule: item.schedule || "",
    });
  };

  const removeJob = async (id) => {
    if (!window.confirm("Видалити посаду?")) return;
    try {
      await deleteJobTitle(id);
    } catch (error) {
      console.error("Помилка видалення посади:", error);
      alert("Не вдалося видалити посаду");
    }
  };

  const submitRequest = async () => {
    if (!selectedRestaurantId || !requestForm.jobTitleId) return;
    const job = jobsForRestaurant.find((item) => item.id === requestForm.jobTitleId);
    if (!job) return;

    try {
      await addRecruitmentRequest({
        restaurantId: selectedRestaurantId,
        restaurantName: currentRestaurant?.name || "",
        jobTitleId: job.id,
        jobTitleName: job.title,
        schedule: job.schedule || "",
        quantity: Number(requestForm.quantity || 1),
        priority: requestForm.priority,
        neededBy: requestForm.neededBy || "",
        comment: String(requestForm.comment || "").trim(),
        status: "new",
        interviewDate: "",
        recruiterComment: "",
        createdById: user?.uid || "",
        createdByName: user?.name || user?.email || "",
      });
      setRequestForm({ jobTitleId: "", quantity: 1, priority: "normal", neededBy: "", comment: "" });
    } catch (error) {
      console.error("Помилка створення заявки:", error);
      alert("Не вдалося створити заявку");
    }
  };

  const updateRecruiterField = async (item, field, value) => {
    try {
      await updateRecruitmentRequest(item.id, { [field]: value });
    } catch (error) {
      console.error("Помилка оновлення заявки:", error);
      alert("Не вдалося оновити заявку");
    }
  };

  const renderRestaurantSelector = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="text-sm font-semibold text-slate-800">Заклад</label>
        <select
          className={inputClass}
          value={selectedRestaurantId}
          onChange={(e) => setSelectedRestaurantId(e.target.value)}
        >
          <option value="">Оберіть заклад</option>
          {restaurants.map((restaurant) => (
            <option key={restaurant.id} value={restaurant.id}>
              {restaurant.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm font-semibold text-slate-800">Місяць</label>
        <input className={inputClass} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
    </div>
  );

  if (!selectedRestaurantId && mode !== "recruiter") {
    return <div className={cardClass}>Оберіть заклад, щоб працювати з персоналом.</div>;
  }

  if (mode === "job-settings") {
    return (
      <div className="space-y-4">
        <div className={cardClass}>
          {renderRestaurantSelector()}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <div>
              <label className="text-sm font-semibold text-slate-800">Посада</label>
              <input className={inputClass} value={jobForm.title} onChange={(e) => setJobForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800">Графік/зміна</label>
              <input className={inputClass} value={jobForm.schedule} onChange={(e) => setJobForm((p) => ({ ...p, schedule: e.target.value }))} placeholder="5/2, 2/2, плаваючий" />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800">ЗП від, грн</label>
              <input className={inputClass} type="number" value={jobForm.salaryFrom} onChange={(e) => setJobForm((p) => ({ ...p, salaryFrom: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800">ЗП до, грн</label>
              <input className={inputClass} type="number" value={jobForm.salaryTo} onChange={(e) => setJobForm((p) => ({ ...p, salaryTo: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-800">Опис обов'язків</label>
              <textarea className={`${inputClass} min-h-[90px]`} value={jobForm.description} onChange={(e) => setJobForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500" onClick={submitJob}>
              {jobForm.id ? "Оновити посаду" : "Додати посаду"}
            </button>
            {jobForm.id && (
              <button className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300" onClick={() => setJobForm({ id: "", title: "", description: "", salaryFrom: "", salaryTo: "", schedule: "" })}>
                Скасувати редагування
              </button>
            )}
          </div>
        </div>

        <div className={cardClass}>
          <h3 className="text-base font-semibold mb-3">Посади в закладі</h3>
          <div className="space-y-2">
            {jobsForRestaurant.map((item) => (
              <div key={item.id} className="border border-slate-200 rounded-lg p-3 flex flex-wrap gap-3 items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{item.title}</div>
                  <div className="text-sm text-slate-600">{item.schedule || "—"} • {item.salaryFrom || 0} - {item.salaryTo || 0} грн</div>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 rounded bg-indigo-100 text-indigo-700 font-semibold" onClick={() => startEditJob(item)}>Редагувати</button>
                  <button className="px-3 py-1.5 rounded bg-red-100 text-red-700 font-semibold" onClick={() => removeJob(item.id)}>Видалити</button>
                </div>
              </div>
            ))}
            {jobsForRestaurant.length === 0 && <p className="text-sm text-slate-500">Посади ще не створені.</p>}
          </div>
        </div>
      </div>
    );
  }

  if (mode === "requests") {
    return (
      <div className="space-y-4">
        <div className={cardClass}>
          {renderRestaurantSelector()}
          <h3 className="text-base font-semibold mt-4 mb-3">Нова заявка на підбір</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-slate-800">Посада</label>
              <select className={inputClass} value={requestForm.jobTitleId} onChange={(e) => setRequestForm((p) => ({ ...p, jobTitleId: e.target.value }))}>
                <option value="">Оберіть посаду</option>
                {jobsForRestaurant.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800">К-ть кандидатів</label>
              <input className={inputClass} type="number" min="1" value={requestForm.quantity} onChange={(e) => setRequestForm((p) => ({ ...p, quantity: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800">Пріоритет</label>
              <select className={inputClass} value={requestForm.priority} onChange={(e) => setRequestForm((p) => ({ ...p, priority: e.target.value }))}>
                <option value="low">Низький</option>
                <option value="normal">Середній</option>
                <option value="high">Високий</option>
                <option value="urgent">Терміново</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800">Потрібно до дати</label>
              <input className={inputClass} type="date" value={requestForm.neededBy} onChange={(e) => setRequestForm((p) => ({ ...p, neededBy: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-800">Коментар</label>
              <textarea className={`${inputClass} min-h-[80px]`} value={requestForm.comment} onChange={(e) => setRequestForm((p) => ({ ...p, comment: e.target.value }))} />
            </div>
          </div>
          <button className="mt-3 px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500" onClick={submitRequest}>
            Відправити заявку рекрутеру
          </button>
        </div>

        <div className={cardClass}>
          <h3 className="text-base font-semibold mb-3">Мої заявки</h3>
          <div className="space-y-2">
            {requestsForRestaurant.map((item) => (
              <div key={item.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex flex-wrap gap-2 justify-between">
                  <div className="font-semibold">{item.jobTitleName}</div>
                  <div className="text-sm">Статус: <span className="font-semibold">{item.status}</span></div>
                </div>
                <div className="text-sm text-slate-600 mt-1">Кількість: {item.quantity} • Пріоритет: {item.priority} • До: {item.neededBy || "—"}</div>
                {item.interviewDate && <div className="text-sm text-indigo-700 mt-1">Співбесіда: {item.interviewDate}</div>}
                {item.recruiterComment && <div className="text-sm text-slate-700 mt-1">Коментар рекрутера: {item.recruiterComment}</div>}
              </div>
            ))}
            {requestsForRestaurant.length === 0 && <p className="text-sm text-slate-500">Заявок ще немає.</p>}
          </div>
        </div>
      </div>
    );
  }

  if (mode === "recruiter") {
    if (!canRecruiterProcess) {
      return <div className={cardClass}>Ця вкладка доступна тільки рекрутеру або адміну.</div>;
    }

    return (
      <div className={cardClass}>
        <h3 className="text-base font-semibold mb-3">Заявки на підбір персоналу</h3>
        <div className="space-y-3">
          {requests.map((item) => (
            <div key={item.id} className="border border-slate-200 rounded-lg p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">{item.restaurantName || "—"} · {item.jobTitleName || "—"}</div>
                  <div className="text-sm text-slate-600">{item.quantity || 1} кандидат(ів) • Пріоритет: {item.priority || "normal"}</div>
                </div>
                <select
                  className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  value={item.status || "new"}
                  onChange={(e) => updateRecruiterField(item, "status", e.target.value)}
                >
                  <option value="new">Нова</option>
                  <option value="in_progress">В роботі</option>
                  <option value="interview_scheduled">Співбесіда призначена</option>
                  <option value="closed">Закрито</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Дата співбесіди</label>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    value={item.interviewDate || ""}
                    onChange={(e) => updateRecruiterField(item, "interviewDate", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Коментар рекрутера</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    value={item.recruiterComment || ""}
                    onChange={(e) => updateRecruiterField(item, "recruiterComment", e.target.value)}
                    placeholder="Примітка по кандидату/етапу"
                  />
                </div>
              </div>
            </div>
          ))}
          {requests.length === 0 && <p className="text-sm text-slate-500">Активних заявок немає.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      {renderRestaurantSelector()}
      <h3 className="text-base font-semibold mt-4 mb-3">Мій персонал · План на {monthToLabel(month)}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600 border-b border-slate-200">
              <th className="py-2 pr-3">Посада</th>
              <th className="py-2 pr-3">Факт, осіб</th>
              <th className="py-2 pr-3">План, осіб</th>
              <th className="py-2 pr-3">Різниця</th>
              <th className="py-2">Дія</th>
            </tr>
          </thead>
          <tbody>
            {editableRows.map((row) => (
              <tr key={row.job.id} className="border-b border-slate-100">
                <td className="py-2 pr-3 font-semibold">{row.job.title}</td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                    value={row.actualCount}
                    onChange={(e) => updateRowDraft(row.job.id, "actualCount", e.target.value)}
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                    value={row.plannedCount}
                    onChange={(e) => updateRowDraft(row.job.id, "plannedCount", e.target.value)}
                  />
                </td>
                <td className="py-2 pr-3 font-semibold">{Number(row.plannedCount) - Number(row.actualCount)}</td>
                <td className="py-2">
                  <button
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:opacity-60"
                    onClick={() => saveStaffingRow(row.job.id)}
                    disabled={savingRowId === row.job.id}
                  >
                    {savingRowId === row.job.id ? "Збереження..." : "Зберегти"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editableRows.length === 0 && (
        <p className="text-sm text-slate-500 mt-3">Немає посад для цього закладу. Додайте їх у вкладці керування посадами.</p>
      )}
    </div>
  );
}
