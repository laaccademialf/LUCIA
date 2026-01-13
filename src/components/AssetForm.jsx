import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { CheckCircle2, ClipboardCheck, Loader2, Save, Camera, Upload, X, ChevronRight, ChevronLeft } from "lucide-react";
import clsx from "clsx";
import { useAssetFields } from "../hooks/useAssetFields";
import { useRestaurants } from "../hooks/useRestaurants";
import { useFieldPermissions } from "../hooks/useFieldPermissions";
import CurrencyInput from "./CurrencyInput";
import MultiSelect from "./MultiSelect";
import AssetNameAutocomplete from "./AssetNameAutocomplete";

const tabs = [
  { id: "identification", label: "Ідентифікація", requiredFields: ["invNumber", "name"] },
  { id: "location", label: "Локація", requiredFields: ["businessUnit", "locationName"] },
  { id: "status", label: "Статус", requiredFields: [] },
  { id: "dates", label: "Дати", requiredFields: [] },
  { id: "depreciation", label: "Знос", requiredFields: [] },
  { id: "value", label: "Вартість", requiredFields: ["residualValue"] },
  { id: "decision", label: "Рішення", requiredFields: ["decision"] },
  { id: "audit", label: "Аудит", requiredFields: [] },
];

const defaultAsset = {
  invNumber: "",
  name: "",
  category: "",
  subCategory: "",
  type: "ОС",
  serialNumber: "",
  brand: "",
  photos: [],
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

export function AssetForm({ selectedAsset, onSubmit, currentUser, restaurants: restaurantsProp, assets: assetsProp = [] }) {
  const [activeTab, setActiveTab] = useState("identification");
  const [completedTabs, setCompletedTabs] = useState([]);
  const [photos, setPhotos] = useState([]);
  
  // Завантаження типових полів з Firebase
  const {
    categories,
    subcategories,
    accountingTypes,
    businessUnits,
    statuses,
    conditions,
    decisions,
    placementZones,
    responsibilityCenters,
    responsiblePersons,
    functionalities,
    relevances,
    reasons,
    loading: fieldsLoading,
  } = useAssetFields();
  
  // Завантаження ресторанів для локації (якщо не передали через пропси)
  const { restaurants: fetchedRestaurants, loading: restaurantsLoading } = useRestaurants();
  const restaurants = restaurantsProp || fetchedRestaurants;
  
  // Завантаження прав редагування полів на основі робочої ролі
  const { canEdit, loading: fieldPermsLoading } = useFieldPermissions(currentUser?.workRole);
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    trigger,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: defaultAsset,
    mode: "onChange",
  });

  // Спостерігаємо за вибраним центром відповідальності
  const selectedRespCenter = watch("respCenter");

  // Фільтруємо МВО по вибраному центру
  const filteredResponsiblePersons = useMemo(() => {
    if (!selectedRespCenter || !responsibilityCenters.length || !responsiblePersons.length) {
      return [];
    }
    const centerObj = responsibilityCenters.find(c => c.name === selectedRespCenter);
    if (!centerObj) return [];
    
    return responsiblePersons
      .filter(p => p.centerId === centerObj.id)
      .map(p => p.name);
  }, [selectedRespCenter, responsibilityCenters, responsiblePersons]);

  useEffect(() => {
    if (selectedAsset) {
      reset({ ...defaultAsset, ...selectedAsset });
      setPhotos(selectedAsset.photos || []);
    } else {
      // При створенні нового активу підставляємо ресторан користувача
      const userRestaurant = currentUser?.restaurant
        ? restaurants.find(r => r.id === currentUser.restaurant)
        : null;
      
      reset({
        ...defaultAsset,
        locationName: userRestaurant?.name || "",
      });
      setPhotos([]);
    }
  }, [selectedAsset, reset, currentUser, restaurants]);

  // Функція для генерації інвентарного номеру
  const generateInvNumber = (locationName, allAssets) => {
    // Знаходимо ресторан по назві локації
    const restaurant = restaurants.find(r => r.name === locationName);
    if (!restaurant) return "";

    // Беремо перші 3 символи облікового номеру
    const prefix = restaurant.regNumber.substring(0, 3);

    // Знаходимо всі активи цього ресторану
    const restaurantAssets = allAssets.filter(a => a.locationName === locationName);

    // Знаходимо максимальний 6-значний суфікс
    let maxNumber = 0;
    restaurantAssets.forEach(asset => {
      if (asset.invNumber && asset.invNumber.startsWith(prefix)) {
        const suffix = parseInt(asset.invNumber.substring(prefix.length), 10);
        if (!isNaN(suffix) && suffix > maxNumber) {
          maxNumber = suffix;
        }
      }
    });

    // Генеруємо новий номер
    const nextNumber = maxNumber + 1;
    return prefix + String(nextNumber).padStart(6, "0");
  };

  useEffect(() => {
    if (selectedAsset) {
      return; // Не генеруємо номер для редагування існуючого активу
    }

    const locationName = watch("locationName");
    if (locationName) {
      // Генеруємо інвентарний номер
      const newInvNumber = generateInvNumber(locationName, assetsProp);
      if (newInvNumber) {
        setValue("invNumber", newInvNumber);
      }
      
      // Автозаповнюємо бізнес-напрям з ресторану
      const restaurant = restaurants.find(r => r.name === locationName);
      if (restaurant && restaurant.businessUnit) {
        setValue("businessUnit", restaurant.businessUnit);
      }
    }
  }, [watch("locationName"), restaurants, setValue, assetsProp]);

  const physicalWear = watch("physicalWear");
  const moralWear = watch("moralWear");

  useEffect(() => {
    const phys = Number(physicalWear) || 0;
    const moral = Number(moralWear) || 0;
    const avg = Math.max(0, Math.min(100, Math.round((phys + moral) / 2)));
    setValue("totalWear", avg);
  }, [physicalWear, moralWear, setValue]);

  // Перевірка чи можна перейти до вкладки
  const canAccessTab = (tabId) => {
    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === 0) return true; // Перша вкладка завжди доступна
    
    // Перевіряємо чи всі попередні вкладки завершені
    for (let i = 0; i < tabIndex; i++) {
      if (!completedTabs.includes(tabs[i].id)) {
        return false;
      }
    }
    return true;
  };

  // Валідація поточної вкладки
  const validateCurrentTab = async () => {
    const currentTabData = tabs.find((t) => t.id === activeTab);
    if (!currentTabData || currentTabData.requiredFields.length === 0) {
      return true;
    }

    const isValid = await trigger(currentTabData.requiredFields);
    return isValid;
  };

  // Перехід до наступної вкладки
  const handleNext = async () => {
    const isValid = await validateCurrentTab();
    
    if (isValid) {
      // Позначаємо поточну вкладку як завершену
      if (!completedTabs.includes(activeTab)) {
        setCompletedTabs([...completedTabs, activeTab]);
      }

      // Переходимо до наступної
      const currentIndex = tabs.findIndex((t) => t.id === activeTab);
      if (currentIndex < tabs.length - 1) {
        setActiveTab(tabs[currentIndex + 1].id);
      }
    }
  };

  // Перехід до попередньої вкладки
  const handlePrev = () => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    if (currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1].id);
    }
  };

  // Обробка фото
  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotos((prev) => [...prev, { url: event.target.result, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleCameraCapture = (e) => {
    handlePhotoUpload(e);
  };

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmitForm = (values) => {
    const payload = {
      ...values,
      photos: photos,
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
    setCompletedTabs([]);
    setPhotos([]);
  };

  const requiredMark = <span className="text-rose-500">*</span>;

  const isMove = watch("decision") === "Перемістити";
  const currentTabIndex = tabs.findIndex((t) => t.id === activeTab);
  const isFirstTab = currentTabIndex === 0;
  const isLastTab = currentTabIndex === tabs.length - 1;

  return (
    <div className="card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Додати актив</h2>
          <p className="text-sm text-slate-500 mt-1">
            Крок {currentTabIndex + 1} з {tabs.length} • Заповнюйте поля послідовно
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-slate-600">
          <ClipboardCheck size={16} /> {completedTabs.length} / {tabs.length} завершено
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tabs.map((tab, index) => {
          const isCompleted = completedTabs.includes(tab.id);
          const isActive = activeTab === tab.id;
          const canAccess = canAccessTab(tab.id);

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => canAccess && setActiveTab(tab.id)}
              disabled={!canAccess}
              className={clsx(
                "rounded-lg px-4 py-3.5 text-sm font-bold transition-all duration-200 border-2 relative",
                isActive
                  ? "bg-indigo-600 text-white shadow-xl shadow-indigo-500/40 border-indigo-500 scale-105"
                  : isCompleted
                  ? "bg-green-50 text-green-800 border-green-400 hover:bg-green-100"
                  : canAccess
                  ? "bg-white text-slate-800 border-slate-300 hover:text-indigo-700 hover:border-indigo-400 hover:shadow-lg"
                  : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50"
              )}
            >
              {isCompleted && (
                <CheckCircle2 className="absolute -top-2 -right-2 text-green-600 bg-white rounded-full" size={20} />
              )}
              {tab.label}
            </button>
          );
        })}
      </div>

      <form className="mt-6 flex flex-col gap-6" onSubmit={handleSubmit(onSubmitForm)}>
        {activeTab === "identification" && (
          <div className="space-y-6">
            <FieldGrid>
              <Input 
                label={<>Інвентарний номер {requiredMark}</>} 
                {...register("invNumber", { required: true })}
                disabled={
                  // Disabled якщо редагуємо існуючий актив АБО якщо немає права редагувати, або права ще вантажаться
                  (selectedAsset !== undefined && selectedAsset !== null) || 
                  fieldPermsLoading ||
                  !canEdit("invNumber")
                }
              />
              <Controller
                name="name"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <AssetNameAutocomplete
                    label={<>Назва активу {requiredMark}</>}
                    {...field}
                    assets={assetsProp}
                    disabled={!canEdit("name")}
                    error={errors.name}
                    onSelectAsset={(assetTemplate) => {
                      // Автозаповнення полів з обраного активу
                      if (assetTemplate.category) setValue("category", assetTemplate.category);
                      if (assetTemplate.subCategory) setValue("subCategory", assetTemplate.subCategory);
                      if (assetTemplate.type) setValue("type", assetTemplate.type);
                      if (assetTemplate.brand) setValue("brand", assetTemplate.brand);
                    }}
                  />
                )}
              />
              <Select
                label="Категорія"
                {...register("category")}
                options={categories.length > 0 ? categories : ["Кухня", "Бар", "IT", "Меблі", "Транспорт"]}
              />
              <Select
                label="Підкатегорія"
                {...register("subCategory")}
                options={subcategories.length > 0 ? subcategories : []}
              />
              <Select
                label="Тип обліку"
                {...register("type")}
                options={accountingTypes.length > 0 ? accountingTypes : ["ОС", "МШП"]}
              />
              <Input label="Серійний номер" {...register("serialNumber")}/>
              <Input label="Виробник / бренд" {...register("brand")}/>
            </FieldGrid>

            {/* Блок завантаження фото */}
            <div className="border-t-2 border-slate-200 pt-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Фотографії активу</h3>
              
              <div className="flex flex-wrap gap-3 mb-4">
                {/* Кнопка завантаження з файлу */}
                <label className="flex items-center gap-2 px-4 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 cursor-pointer transition shadow">
                  <Upload size={18} />
                  Завантажити фото
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </label>

                {/* Кнопка камери (для мобільних) */}
                <label className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-500 cursor-pointer transition shadow">
                  <Camera size={18} />
                  Зробити фото
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleCameraCapture}
                  />
                </label>
              </div>

              {/* Превʼю фотографій */}
              {photos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {photos.map((photo, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={photo.url}
                        alt={`Фото ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg border-2 border-slate-300 shadow"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        className="absolute -top-2 -right-2 p-1 rounded-full bg-red-600 text-white hover:bg-red-700 opacity-0 group-hover:opacity-100 transition shadow-lg"
                      >
                        <X size={16} />
                      </button>
                      <p className="text-xs text-slate-600 mt-1 truncate">{photo.name}</p>
                    </div>
                  ))}
                </div>
              )}

              {photos.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50">
                  <Camera size={48} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-slate-600">Немає завантажених фото</p>
                  <p className="text-sm text-slate-500">Завантажте фото активу для ідентифікації</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "location" && (
          <FieldGrid>
            <Select
              label={<>Бізнес-напрям {requiredMark}</>}
              {...register("businessUnit", { required: true })}
              options={businessUnits.length > 0 ? businessUnits : ["Ресторан", "Кав'ярня", "Кейтеринг", "Офіс", "Склад"]}
            />
            <Select
              label={<>Назва локації (Ресторан) {requiredMark}</>}
              {...register("locationName", { required: true })}
              options={restaurants.map((r) => r.name)}
            />
            <Select
              label="Зона розміщення"
              {...register("zone")}
              options={placementZones.length > 0 ? placementZones : ["Зал", "Кухня", "Бар", "Склад", "Адміністрація"]}
            />
            <Select
              label="Центр відповідальності"
              {...register("respCenter")}
              options={responsibilityCenters.length > 0 ? responsibilityCenters.map(c => c.name) : ["Відділ ІТ", "Бухгалтерія", "HR", "Маркетинг"]}
            />
            <Controller
              name="respPerson"
              control={control}
              render={({ field }) => (
                <MultiSelect
                  label="Матеріально відповідальна особа"
                  {...field}
                  options={filteredResponsiblePersons}
                  disabled={!selectedRespCenter}
                />
              )}
            />
          </FieldGrid>
        )}

        {activeTab === "status" && (
          <FieldGrid>
            <Select
              label="Статус активу"
              {...register("status")}
              options={statuses.length > 0 ? statuses : ["В експлуатації", "Не використовується", "Законсервований"]}
            />
            <Select
              label="Фактичний стан"
              {...register("condition")}
              options={conditions.length > 0 ? conditions : ["Новий", "Добрий", "Задовільний", "Критичний"]}
            />
            <Select
              label="Працездатність"
              {...register("functionality")}
              options={functionalities.length > 0 ? functionalities : ["Працює", "Частково", "Не працює"]}
            />
            <Select
              label="Моральна актуальність"
              {...register("relevance")}
              options={relevances.length > 0 ? relevances : ["Актуальний", "Частково застарілий", "Застарілий"]}
            />
            <Textarea label="Коментар по стану" {...register("comment")} rows={3} />
          </FieldGrid>
        )}

        {activeTab === "dates" && (
          <FieldGrid>
            <Input type="date" label="Дата придбання" {...register("purchaseYear")}/>
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
            <Controller
              name="initialCost"
              control={control}
              render={({ field }) => (
                <CurrencyInput label="Первісна вартість" {...field} />
              )}
            />
            <Controller
              name="marketValueNew"
              control={control}
              render={({ field }) => (
                <CurrencyInput label="Ринкова вартість нового" {...field} />
              )}
            />
            <Controller
              name="marketValueUsed"
              control={control}
              render={({ field }) => (
                <CurrencyInput label="Оціночна вартість б/в" {...field} />
              )}
            />
            <Controller
              name="residualValue"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <CurrencyInput
                  label={<>Управлінська залишкова вартість {requiredMark}</>}
                  {...field}
                  error={errors.residualValue}
                />
              )}
            />
          </FieldGrid>
        )}

        {activeTab === "decision" && (
          <FieldGrid>
            <Select
              label={<>Рішення {requiredMark}</>}
              {...register("decision", { required: true })}
              options={decisions.length > 0 ? decisions : ["Залишити", "Списати", "Продати", "Перемістити"]}
            />
            <Select
              label="Причина"
              {...register("reason")}
              options={reasons.length > 0 ? reasons : ["Знос", "Надлишок", "Непридатність"]}
            />
            {isMove && <Input label="Нова локація" {...register("newLocation")}/>}            
          </FieldGrid>
        )}

        {activeTab === "audit" && (
          <FieldGrid>
            <Input type="date" label="Дата інвентаризації" {...register("auditDate")}/>
            <Input label="Члени комісії" {...register("auditors")}/>
          </FieldGrid>
        )}

        {/* Навігаційні кнопки */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-indigo-700 pt-4">
          <div className="flex items-center gap-3">
            {!isFirstTab && (
              <button
                type="button"
                onClick={handlePrev}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg font-bold text-base bg-slate-200 text-slate-700 hover:bg-slate-300 transition-all duration-200 shadow"
              >
                <ChevronLeft size={18} />
                Назад
              </button>
            )}
            
            {!isLastTab && (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg font-bold text-base bg-indigo-600 text-white hover:bg-indigo-500 transition-all duration-200 shadow-xl shadow-indigo-500/50"
              >
                Далі
                <ChevronRight size={18} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm font-bold text-rose-400">
              {Object.keys(errors).length > 0 && "Заповніть обовʼязкові поля"}
            </div>
            
            {isLastTab && (
              <button 
                type="submit" 
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg font-bold text-base bg-gradient-to-r from-green-600 to-green-700 border-2 border-green-500 text-white hover:from-green-500 hover:to-green-600 hover:border-green-400 transition-all duration-200 shadow-xl shadow-green-500/50 hover:shadow-green-400/70"
              >
                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} 
                Зберегти актив
              </button>
            )}
          </div>
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
