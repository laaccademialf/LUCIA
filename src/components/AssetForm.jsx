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
    <div className="card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Додати актив</h2>
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-slate-600">
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
              "rounded-lg px-4 py-3.5 text-sm font-bold transition-all duration-200 border-2",
              activeTab === tab.id
                ? "bg-indigo-600 text-white shadow-xl shadow-indigo-500/40 border-indigo-500 scale-105"
                : "bg-white text-slate-800 border-slate-300 hover:text-indigo-700 hover:border-indigo-400 hover:shadow-lg"
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-indigo-700 pt-4">
          <div className="text-sm font-bold text-rose-400">
            {Object.keys(errors).length > 0 && "Заповніть обовʼязкові поля"}
          </div>
          <button type="submit" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg font-bold text-base bg-gradient-to-r from-indigo-600 to-indigo-700 border-2 border-indigo-500 text-white hover:from-indigo-500 hover:to-indigo-600 hover:border-indigo-400 transition-all duration-200 shadow-xl shadow-indigo-500/50 hover:shadow-indigo-400/70">
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Зберегти актив
          </button>
        </div>
      </form>
    </div>
  );
}

function FieldGrid({ children }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

// Light, high-contrast inputs for better readability on dark container
const baseInput = "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 font-medium shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-150 placeholder:text-gray-500";

const Input = ({ label, disabled, type = "text", ...rest }) => (
  <label className="flex flex-col gap-2.5 text-sm">
    <span className="font-semibold text-slate-800">{label}</span>
    <input 
      type={type}
      disabled={disabled} 
      className={clsx(baseInput, disabled && "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200")} 
      {...rest} 
    />
  </label>
);

const Select = ({ label, options = [], ...rest }) => (
  <label className="flex flex-col gap-2.5 text-sm">
    <span className="font-semibold text-slate-800">{label}</span>
    <select className={clsx(baseInput, "appearance-none cursor-pointer pr-8 bg-right bg-no-repeat [&>option]:bg-white [&>option]:text-gray-900 [&>option]:py-3 [&>option]:font-medium")} {...rest}>
      <option value="" className="bg-white text-gray-900">Обери опцію...</option>
      {options.map((opt) => (
        <option key={opt} value={opt} className="bg-white text-gray-900">
          {opt}
        </option>
      ))}
    </select>
  </label>
);

const Textarea = ({ label, rows = 3, ...rest }) => (
  <label className="flex flex-col gap-2.5 text-sm">
    <span className="font-semibold text-slate-800">{label}</span>
    <textarea rows={rows} className={`${baseInput} resize-none min-h-[100px]`} {...rest} />
  </label>
);
