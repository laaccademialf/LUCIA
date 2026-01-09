import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { CheckCircle2, ClipboardCheck, Loader2, Save } from "lucide-react";
import clsx from "clsx";

const tabs = [
  { id: "identification", label: "Ідентифікація" },
  { id: "location", label: "Локація" },
  { id: "status", label: "Статус" },
  { id: "dates", label: "Дати" },
  { id: "depreciation", label: "Знос" },
  { id: "value", label: "Вартість" },
  { id: "decision", label: "Рішення" },
  { id: "audit", label: "Аудит" },
];

const defaultAsset = {
  invNumber: "",
  name: "",
  category: "",
  subCategory: "",
  type: "ОС",
  serialNumber: "",
  brand: "",
  businessUnit: "",
  locationName: "",
  zone: "",
  respCenter: "",
  respPerson: "",
  status: "В експлуатації",
  condition: "Добрий",
  functionality: "Працює",
  relevance: "Актуальний",
  comment: "",
  purchaseYear: "",
  commissionDate: "",
  normativeTerm: "",
  physicalWear: "",
  moralWear: "",
  totalWear: 0,
  initialCost: "",
  marketValueNew: "",
  marketValueUsed: "",
  residualValue: "",
  decision: "Залишити",
  reason: "Знос",
  newLocation: "",
  auditDate: new Date().toISOString().slice(0, 10),
  auditors: "",
};

export function AssetForm({ selectedAsset, onSubmit }) {
  const [activeTab, setActiveTab] = useState("identification");
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: defaultAsset,
  });

  useEffect(() => {
    if (selectedAsset) {
      reset({ ...defaultAsset, ...selectedAsset });
    } else {
      reset(defaultAsset);
    }
  }, [selectedAsset, reset]);

  const physicalWear = watch("physicalWear");
  const moralWear = watch("moralWear");

  useEffect(() => {
    const phys = Number(physicalWear) || 0;
    const moral = Number(moralWear) || 0;
    const avg = Math.max(0, Math.min(100, Math.round((phys + moral) / 2)));
    setValue("totalWear", avg);
  }, [physicalWear, moralWear, setValue]);

  const onSubmitForm = (values) => {
    const payload = {
      ...values,
      physicalWear: Number(values.physicalWear) || 0,
      moralWear: Number(values.moralWear) || 0,
      totalWear: Number(values.totalWear) || 0,
      purchaseYear: values.purchaseYear ? Number(values.purchaseYear) : "",
      normativeTerm: values.normativeTerm ? Number(values.normativeTerm) : "",
      initialCost: values.initialCost ? Number(values.initialCost) : 0,
      marketValueNew: values.marketValueNew ? Number(values.marketValueNew) : 0,
      marketValueUsed: values.marketValueUsed ? Number(values.marketValueUsed) : 0,
      residualValue: values.residualValue ? Number(values.residualValue) : 0,
    };
    onSubmit(payload);
    setActiveTab("identification");
  };

  const requiredMark = <span className="text-rose-500">*</span>;

  const isMove = watch("decision") === "Перемістити";

  return (
    <div className="card p-5 bg-slate-800/60 border-slate-700 text-slate-50 shadow-xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-indigo-400 font-semibold">Форма</p>
          <h2 className="text-xl font-semibold text-slate-50">Додати / редагувати актив</h2>
          <p className="text-sm text-slate-300">8 блоків замість довгого скролу</p>
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-slate-400">
          <ClipboardCheck size={16} /> Обовʼязкові: назва, інв. номер, локація, залишкова, рішення
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "rounded-lg border px-3 py-2.5 text-sm font-semibold transition",
              activeTab === tab.id
                ? "border-indigo-400 bg-gradient-to-br from-indigo-600/90 to-indigo-700 text-white shadow-lg shadow-indigo-500/30"
                : "border-indigo-500/30 bg-slate-800/50 text-indigo-200 hover:border-indigo-400/60 hover:bg-slate-700/50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form className="mt-6 flex flex-col gap-6" onSubmit={handleSubmit(onSubmitForm)}>
        {activeTab === "identification" && (
          <FieldGrid>
            <Input label={<>Інвентарний номер {requiredMark}</>} {...register("invNumber", { required: true })} />
            <Input label={<>Назва активу {requiredMark}</>} {...register("name", { required: true })} />
            <Select
              label="Категорія"
              {...register("category")}
              options={["Кухня", "Бар", "IT", "Меблі", "Транспорт"]}
            />
            <Input label="Підкатегорія" {...register("subCategory")}/>
            <Select label="Тип обліку" {...register("type")} options={["ОС", "МШП"]} />
            <Input label="Серійний номер" {...register("serialNumber")}/>
            <Input label="Виробник / бренд" {...register("brand")}/>
          </FieldGrid>
        )}

        {activeTab === "location" && (
          <FieldGrid>
            <Select
              label={<>Бізнес-напрям {requiredMark}</>}
              {...register("businessUnit", { required: true })}
              options={["Ресторан", "Кав’ярня", "Кейтеринг", "Офіс", "Склад"]}
            />
            <Input label="Назва локації" {...register("locationName", { required: true })} />
            <Input label="Зона розміщення" {...register("zone")}/>
            <Input label="Центр відповідальності" {...register("respCenter")}/>
            <Input label="Матеріально відповідальна особа" {...register("respPerson")}/>
          </FieldGrid>
        )}

        {activeTab === "status" && (
          <FieldGrid>
            <Select label="Статус активу" {...register("status")} options={["В експлуатації", "Не використовується", "Законсервований"]} />
            <Select label="Фактичний стан" {...register("condition")} options={["Новий", "Добрий", "Задовільний", "Критичний"]} />
            <Select label="Працездатність" {...register("functionality")} options={["Працює", "Частково", "Не працює"]} />
            <Select label="Моральна актуальність" {...register("relevance")} options={["Актуальний", "Частково застарілий", "Застарілий"]} />
            <Textarea label="Коментар по стану" {...register("comment")} rows={3} />
          </FieldGrid>
        )}

        {activeTab === "dates" && (
          <FieldGrid>
            <Input type="number" label="Рік придбання" {...register("purchaseYear")}/>
            <Input type="date" label="Дата введення в експлуатацію" {...register("commissionDate")}/>
            <Input type="number" label="Нормативний строк, років" {...register("normativeTerm")}/>
          </FieldGrid>
        )}

        {activeTab === "depreciation" && (
          <FieldGrid>
            <Input type="number" label="Фізичний знос %" {...register("physicalWear")} />
            <Input type="number" label="Моральний знос %" {...register("moralWear")} />
            <Input
              type="number"
              label="Загальний знос % (авто)"
              disabled
              readOnly
              value={watch("totalWear") || 0}
            />
            <input type="hidden" value={watch("totalWear") || 0} {...register("totalWear")} />
          </FieldGrid>
        )}

        {activeTab === "value" && (
          <FieldGrid>
            <Input type="number" label="Первісна вартість" {...register("initialCost")}/>
            <Input type="number" label="Ринкова вартість нового" {...register("marketValueNew")}/>
            <Input type="number" label="Оціночна вартість б/в" {...register("marketValueUsed")}/>
            <Input
              type="number"
              label={<>Управлінська залишкова вартість {requiredMark}</>}
              {...register("residualValue", { required: true })}
            />
          </FieldGrid>
        )}

        {activeTab === "decision" && (
          <FieldGrid>
            <Select
              label={<>Рішення {requiredMark}</>}
              {...register("decision", { required: true })}
              options={["Залишити", "Списати", "Продати", "Перемістити"]}
            />
            <Select label="Причина" {...register("reason")} options={["Знос", "Надлишок", "Непридатність"]} />
            {isMove && <Input label="Нова локація" {...register("newLocation")}/>}            
          </FieldGrid>
        )}

        {activeTab === "audit" && (
          <FieldGrid>
            <Input type="date" label="Дата інвентаризації" {...register("auditDate")}/>
            <Input label="Члени комісії" {...register("auditors")}/>
          </FieldGrid>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-4">
          <div className="text-sm text-rose-400">
            {Object.keys(errors).length > 0 && "Заповніть обовʼязкові поля"}
          </div>
          <button type="submit" className="btn btn-primary">
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Зберегти актив
          </button>
        </div>
      </form>
    </div>
  );
}

function FieldGrid({ children }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

const baseInput = "w-full rounded-xl border border-indigo-500/40 bg-gradient-to-br from-slate-800/80 to-slate-900/90 px-4 py-3 text-sm text-slate-50 shadow-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/50 focus:outline-none transition placeholder:text-slate-500 hover:border-indigo-400/60";

const Input = ({ label, disabled, type = "text", ...rest }) => (
  <label className="flex flex-col gap-2 text-sm text-slate-200">
    <span className="font-semibold text-indigo-300">{label}</span>
    <input 
      type={type}
      disabled={disabled} 
      className={clsx(baseInput, disabled && "bg-slate-700/30 text-slate-500 cursor-not-allowed border-slate-600/30")} 
      {...rest} 
    />
  </label>
);

const Select = ({ label, options = [], ...rest }) => (
  <label className="flex flex-col gap-2 text-sm text-slate-200">
    <span className="font-semibold text-indigo-300">{label}</span>
    <select className={clsx(baseInput, "appearance-none cursor-pointer pr-8 bg-right bg-no-repeat [&>option]:bg-slate-800 [&>option]:text-slate-50 [&>option]:py-2")} {...rest}>
      <option value="" className="bg-slate-800 text-slate-50">Обери опцію...</option>
      {options.map((opt) => (
        <option key={opt} value={opt} className="bg-slate-800 text-slate-50">
          {opt}
        </option>
      ))}
    </select>
  </label>
);

const Textarea = ({ label, rows = 3, ...rest }) => (
  <label className="flex flex-col gap-2 text-sm text-slate-200">
    <span className="font-semibold text-indigo-300">{label}</span>
    <textarea rows={rows} className={`${baseInput} resize-none`} {...rest} />
  </label>
);
