import { useEffect, useMemo, useState } from "react";
import {
  addTeamEmployee,
  addTeamShiftEvent,
  addJobTitle,
  addRecruitmentRequest,
  deleteJobTitle,
  subscribeToJobTitles,
  subscribeToRecruitmentRequests,
  subscribeToTeamEmployees,
  subscribeToTeamShiftEvents,
  updateJobTitle,
  updateRecruitmentRequest,
} from "../firebase/staffing";

const cardClass = "card p-4 sm:p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100";

const resolveTabMode = (topTab, activeNav) => {
  const key = String(topTab || "").toLowerCase();
  const navKey = String(activeNav || "").toLowerCase();

  // First priority: explicit top tab inside the section.
  if (key.includes("kiper") || key.includes("keeper")) {
    return "employee-keeper";
  }

  if (key.includes("tabel") || key.includes("table") || key.includes("workhour")) {
    return "work-hours-employee";
  }

  // Fallback: dedicated nav section without explicit topTab match.
  if (navKey === "workhoursemployee") return "work-hours-employee";
  if (navKey === "employeekeeper") return "employee-keeper";

  if (key === "mystafing") {
    return "my-staffing";
  }
  if (key === "workhoursemployee") {
    return "work-hours-employee";
  }
  if (key === "employeekeeper") {
    return "employee-keeper";
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

export default function TeamHiringModule({ topTab, activeNav, restaurants = [], user }) {
  const [jobTitles, setJobTitles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [shiftEvents, setShiftEvents] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [keeperCode, setKeeperCode] = useState("");

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

  const [employeeForm, setEmployeeForm] = useState({
    lastName: "",
    firstName: "",
    jobTitleId: "",
  });
  const mode = resolveTabMode(topTab, activeNav);
  const canRecruiterProcess = useMemo(() => {
    const role = String(user?.role || "").toLowerCase();
    const workRole = String(user?.workRole || "").toLowerCase();
    return role === "admin" || role.includes("recruit") || workRole.includes("recruit");
  }, [user]);

  useEffect(() => {
    const unsubJobs = subscribeToJobTitles(setJobTitles);
    const unsubRequests = subscribeToRecruitmentRequests(setRequests);
    const unsubEmployees = subscribeToTeamEmployees(setEmployees);
    const unsubEvents = subscribeToTeamShiftEvents(setShiftEvents);

    return () => {
      unsubJobs?.();
      unsubRequests?.();
      unsubEmployees?.();
      unsubEvents?.();
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

  const employeesForRestaurant = useMemo(
    () => employees.filter((item) => String(item.restaurantId) === String(selectedRestaurantId)),
    [employees, selectedRestaurantId]
  );

  const eventsForRestaurant = useMemo(
    () => shiftEvents.filter((item) => String(item.restaurantId) === String(selectedRestaurantId)),
    [shiftEvents, selectedRestaurantId]
  );

  const requestsForRestaurant = useMemo(
    () => requests.filter((item) => String(item.restaurantId) === String(selectedRestaurantId)),
    [requests, selectedRestaurantId]
  );

  const employeeJobTitleMap = useMemo(() => {
    return jobsForRestaurant.reduce((acc, item) => {
      acc[item.id] = item.title || "";
      return acc;
    }, {});
  }, [jobsForRestaurant]);

  const computeSessions = (events) => {
    const ordered = [...events].sort((a, b) =>
      String(a.eventAt || a.createdAt || "").localeCompare(String(b.eventAt || b.createdAt || ""))
    );

    let openStart = null;
    const sessions = [];

    ordered.forEach((event) => {
      const type = String(event.type || "").toLowerCase();
      const point = String(event.eventAt || event.createdAt || "");
      if (!point) return;

      if (type === "start") {
        if (!openStart) {
          openStart = point;
        }
        return;
      }

      if (type === "end" && openStart) {
        const startMs = Date.parse(openStart);
        const endMs = Date.parse(point);
        if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
          sessions.push({ startAt: openStart, endAt: point, durationMs: endMs - startMs });
        }
        openStart = null;
      }
    });

    return { sessions, hasOpenShift: Boolean(openStart), openStartAt: openStart };
  };

  const employeeEventsMap = useMemo(() => {
    return eventsForRestaurant.reduce((acc, event) => {
      const employeeId = String(event.employeeId || "");
      if (!employeeId) return acc;
      if (!acc[employeeId]) acc[employeeId] = [];
      acc[employeeId].push(event);
      return acc;
    }, {});
  }, [eventsForRestaurant]);

  const employeeSummaries = useMemo(() => {
    return employeesForRestaurant
      .map((employee) => {
        const employeeEvents = employeeEventsMap[employee.id] || [];
        const monthEvents = employeeEvents.filter((event) => String(event.eventAt || "").slice(0, 7) === String(month));
        const { sessions, hasOpenShift, openStartAt } = computeSessions(monthEvents);
        const totalMs = sessions.reduce((acc, session) => acc + session.durationMs, 0);

        return {
          ...employee,
          sessionsCount: sessions.length,
          workedHours: Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100,
          hasOpenShift,
          openStartAt,
        };
      })
      .sort((a, b) => String(a.employeeNumber || "").localeCompare(String(b.employeeNumber || "")));
  }, [employeesForRestaurant, employeeEventsMap, month]);

  const keeperEmployee = useMemo(() => {
    const code = String(keeperCode || "").trim();
    if (!code) return null;
    return employeesForRestaurant.find((item) => String(item.employeeNumber || "") === code) || null;
  }, [keeperCode, employeesForRestaurant]);

  const keeperEmployeeStatus = useMemo(() => {
    if (!keeperEmployee) {
      return { hasOpenShift: false, openStartAt: null };
    }
    const result = computeSessions(employeeEventsMap[keeperEmployee.id] || []);
    return { hasOpenShift: result.hasOpenShift, openStartAt: result.openStartAt };
  }, [keeperEmployee, employeeEventsMap]);

  const generateEmployeeNumber = () => {
    const restaurant = currentRestaurant;
    const regNumber = String(restaurant?.regNumber || "").trim();
    const prefix = regNumber.slice(0, 3) || String(restaurant?.id || "").slice(0, 3).toUpperCase() || "EMP";

    const maxSuffix = employeesForRestaurant.reduce((acc, item) => {
      const num = String(item.employeeNumber || "");
      if (!num.startsWith(prefix)) return acc;
      const tail = num.slice(prefix.length);
      const parsed = Number(tail);
      if (!Number.isFinite(parsed)) return acc;
      return Math.max(acc, parsed);
    }, 0);

    return `${prefix}${String(maxSuffix + 1).padStart(4, "0")}`;
  };

  const submitEmployee = async () => {
    const lastName = String(employeeForm.lastName || "").trim();
    const firstName = String(employeeForm.firstName || "").trim();
    const jobTitleId = String(employeeForm.jobTitleId || "").trim();
    const jobTitleName = employeeJobTitleMap[jobTitleId] || "";

    if (!selectedRestaurantId || !lastName || !firstName || !jobTitleId) {
      alert("Заповніть прізвище, ім'я та посаду");
      return;
    }

    try {
      await addTeamEmployee({
        restaurantId: selectedRestaurantId,
        restaurantName: currentRestaurant?.name || "",
        employeeNumber: generateEmployeeNumber(),
        lastName,
        firstName,
        fullName: `${lastName} ${firstName}`.trim(),
        jobTitleId,
        jobTitleName,
        isActive: true,
        createdById: user?.uid || "",
        createdByName: user?.name || user?.email || "",
      });

      setEmployeeForm({ lastName: "", firstName: "", jobTitleId: "" });
    } catch (error) {
      console.error("Помилка створення співробітника:", error);
      alert("Не вдалося додати співробітника");
    }
  };

  const handleKeeperAction = async (actionType) => {
    if (!keeperEmployee) {
      alert("Співробітника з таким номером не знайдено");
      return;
    }

    const nowIso = new Date().toISOString();
    const isStart = actionType === "start";

    if (isStart && keeperEmployeeStatus.hasOpenShift) {
      alert("Зміна вже розпочата. Спочатку натисніть 'Кінець роботи'.");
      return;
    }

    if (!isStart && !keeperEmployeeStatus.hasOpenShift) {
      alert("Немає відкритої зміни. Спочатку натисніть 'Початок роботи'.");
      return;
    }

    try {
      await addTeamShiftEvent({
        restaurantId: selectedRestaurantId,
        restaurantName: currentRestaurant?.name || "",
        employeeId: keeperEmployee.id,
        employeeNumber: keeperEmployee.employeeNumber || "",
        employeeName: keeperEmployee.fullName || `${keeperEmployee.lastName || ""} ${keeperEmployee.firstName || ""}`.trim(),
        jobTitleId: keeperEmployee.jobTitleId || "",
        jobTitleName: keeperEmployee.jobTitleName || "",
        type: isStart ? "start" : "end",
        eventAt: nowIso,
      });

      alert(isStart ? "Початок роботи зафіксовано" : "Кінець роботи зафіксовано");
    } catch (error) {
      console.error("Помилка фіксації події зміни:", error);
      alert("Не вдалося зафіксувати подію");
    }
  };

  const keypadButtons = [
    "1", "2", "3",
    "4", "5", "6",
    "7", "8", "9",
    "C", "0", "⌫",
  ];

  const onKeypadPress = (value) => {
    if (value === "C") {
      setKeeperCode("");
      return;
    }

    if (value === "⌫") {
      setKeeperCode((prev) => prev.slice(0, -1));
      return;
    }

    setKeeperCode((prev) => `${prev}${value}`.slice(0, 12));
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

  const employeePositionOptions = useMemo(() => {
    return jobsForRestaurant.map((item) => ({ id: item.id, title: item.title }));
  }, [jobsForRestaurant]);

  if (!selectedRestaurantId && mode !== "recruiter") {
    return <div className={cardClass}>Оберіть заклад, щоб працювати з персоналом.</div>;
  }

  if (mode === "employee-keeper") {
    return (
      <div className="space-y-4">
        <div className={cardClass}>
          {renderRestaurantSelector()}
          <h3 className="text-base font-semibold mt-4 mb-3">Табель · Кіпер</h3>
          <p className="text-sm text-slate-600">Введіть номер співробітника на цифровій клавіатурі та зафіксуйте початок/кінець зміни.</p>

          <div className="mt-4 max-w-sm">
            <label className="text-sm font-semibold text-slate-800">Номер співробітника</label>
            <input
              className={`${inputClass} text-center text-xl tracking-[0.2em] font-semibold`}
              value={keeperCode}
              onChange={(e) => setKeeperCode(String(e.target.value || "").replace(/[^0-9A-Za-z]/g, "").slice(0, 12))}
              placeholder="___"
            />
            {keeperEmployee ? (
              <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {keeperEmployee.fullName} · {keeperEmployee.jobTitleName || "Без посади"}
              </div>
            ) : keeperCode ? (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Співробітник з таким номером не знайдений
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 max-w-sm">
            {keypadButtons.map((btn) => (
              <button
                key={btn}
                type="button"
                onClick={() => onKeypadPress(btn)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-lg font-semibold text-slate-800 hover:bg-slate-100"
              >
                {btn}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleKeeperAction("start")}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Початок роботи
            </button>
            <button
              type="button"
              onClick={() => handleKeeperAction("end")}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
            >
              Кінець роботи
            </button>
          </div>

          {keeperEmployee && (
            <div className="mt-3 text-sm text-slate-600">
              Статус зміни: {keeperEmployeeStatus.hasOpenShift ? "В роботі" : "Поза зміною"}
              {keeperEmployeeStatus.openStartAt && (
                <span> · Початок: {new Date(keeperEmployeeStatus.openStartAt).toLocaleString("uk-UA")}</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (mode === "work-hours-employee") {
    return (
      <div className={cardClass}>
        {renderRestaurantSelector()}
        <h3 className="text-base font-semibold mt-4 mb-3">Табель · Підсумок по годинах ({monthToLabel(month)})</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 border-b border-slate-200">
                <th className="py-2 pr-3">Номер</th>
                <th className="py-2 pr-3">Співробітник</th>
                <th className="py-2 pr-3">Посада</th>
                <th className="py-2 pr-3">Змін</th>
                <th className="py-2 pr-3">Годин</th>
                <th className="py-2">Статус</th>
              </tr>
            </thead>
            <tbody>
              {employeeSummaries.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-semibold">{row.employeeNumber || "—"}</td>
                  <td className="py-2 pr-3">{row.fullName || "—"}</td>
                  <td className="py-2 pr-3">{row.jobTitleName || "—"}</td>
                  <td className="py-2 pr-3">{row.sessionsCount}</td>
                  <td className="py-2 pr-3 font-semibold">{row.workedHours.toFixed(2)}</td>
                  <td className="py-2">{row.hasOpenShift ? "В роботі" : "Поза зміною"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {employeeSummaries.length === 0 && (
          <p className="text-sm text-slate-500 mt-3">Немає співробітників для цього закладу.</p>
        )}
      </div>
    );
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
    <div className="space-y-4">
      <div className={cardClass}>
        {renderRestaurantSelector()}
        <h3 className="text-base font-semibold mt-4 mb-3">Мій персонал · Співробітники</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-sm font-semibold text-slate-800">Прізвище</label>
            <input
              className={inputClass}
              value={employeeForm.lastName}
              onChange={(e) => setEmployeeForm((prev) => ({ ...prev, lastName: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Ім'я</label>
            <input
              className={inputClass}
              value={employeeForm.firstName}
              onChange={(e) => setEmployeeForm((prev) => ({ ...prev, firstName: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Посада</label>
            <select
              className={inputClass}
              value={employeeForm.jobTitleId}
              onChange={(e) => setEmployeeForm((prev) => ({ ...prev, jobTitleId: e.target.value }))}
            >
              <option value="">Оберіть посаду</option>
              {employeePositionOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={submitEmployee}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Додати співробітника
            </button>
          </div>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          Номер співробітника генерується автоматично: префікс закладу + 0001, 0002...
        </p>
      </div>

      <div className={cardClass}>
        <h3 className="text-base font-semibold mb-3">Список співробітників</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 border-b border-slate-200">
                <th className="py-2 pr-3">Номер</th>
                <th className="py-2 pr-3">Прізвище</th>
                <th className="py-2 pr-3">Ім'я</th>
                <th className="py-2 pr-3">Посада</th>
                <th className="py-2">Статус</th>
              </tr>
            </thead>
            <tbody>
              {employeesForRestaurant
                .slice()
                .sort((a, b) => String(a.employeeNumber || "").localeCompare(String(b.employeeNumber || "")))
                .map((employee) => (
                  <tr key={employee.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-semibold">{employee.employeeNumber || "—"}</td>
                    <td className="py-2 pr-3">{employee.lastName || "—"}</td>
                    <td className="py-2 pr-3">{employee.firstName || "—"}</td>
                    <td className="py-2 pr-3">{employee.jobTitleName || "—"}</td>
                    <td className="py-2">{employee.isActive === false ? "Неактивний" : "Активний"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {employeesForRestaurant.length === 0 && (
          <p className="text-sm text-slate-500 mt-3">Немає співробітників для цього закладу.</p>
        )}
      </div>
    </div>
  );
}
