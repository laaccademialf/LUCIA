import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { CheckCircle2, ClipboardCheck, Loader2, Save, Camera, Upload, X, ChevronRight, ChevronLeft, Printer } from "lucide-react";
import clsx from "clsx";
import { useAssetFields } from "../hooks/useAssetFields";
import { useRestaurants } from "../hooks/useRestaurants";
import { useFieldPermissions } from "../hooks/useFieldPermissions";
import CurrencyInput from "./CurrencyInput";
import MultiSelect from "./MultiSelect";
import AssetNameAutocomplete from "./AssetNameAutocomplete";
import { printAssetQrLabel } from "../utils/printQrLabel";
import { isAssetsApiEnabled, uploadAssetPhotoApi } from "../api/assetsApi";

const tabs = [
  { id: "identification", label: "Ідентифікація", requiredFields: ["invNumber", "name"] },
  { id: "location", label: "Локація", requiredFields: ["businessUnit", "locationName"] },
  { id: "status", label: "Статус", requiredFields: [] },
  { id: "dates", label: "Дати", requiredFields: [] },
  { id: "depreciation", label: "Знос", requiredFields: [] },
  { id: "value", label: "Вартість", requiredFields: ["residualValuePerUnit"] },
  { id: "decision", label: "Рішення", requiredFields: ["decision"] },
  { id: "audit", label: "Аудит", requiredFields: [] },
];

const defaultAsset = {
  invNumber: "",
  invNumber1C: "",
  name: "",
  category: "",
  subCategory: "",
  type: "ОС",
  inventoryQuantity: "",
  nextInventoryQuantity: "",
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
  residualValuePerUnit: "",
  residualValue: "",
  decision: "Залишити",
  reason: "Знос",
  reasonComment: "",
  newLocation: "",
  auditDate: new Date().toISOString().slice(0, 10),
  auditors: "",
};

export function AssetForm({ selectedAsset, onSubmit, currentUser, restaurants: restaurantsProp, assets: assetsProp = [] }) {
  const isEdit = !!selectedAsset;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.workRole === 'admin';
  const [activeTab, setActiveTab] = useState("identification");
  const [completedTabs, setCompletedTabs] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [processingPhotos, setProcessingPhotos] = useState(false);
  const [printedQrFingerprint, setPrintedQrFingerprint] = useState("");
  
  // Завантаження типових полів з Firebase
  const {
    categories,
    subcategories,
    subcategoryItems,
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
  const selectedCategory = watch("category");
  const selectedSubCategory = watch("subCategory");
  const selectedType = watch("type");
  const selectedBusinessUnit = watch("businessUnit");
  const selectedLocationName = watch("locationName");
  const selectedZone = watch("zone");
  const selectedStatus = watch("status");
  const selectedCondition = watch("condition");
  const selectedFunctionality = watch("functionality");
  const selectedRelevance = watch("relevance");
  const selectedDecision = watch("decision");
  const selectedReason = watch("reason");
  const inventoryQuantityValue = watch("inventoryQuantity");
  const residualValuePerUnitValue = watch("residualValuePerUnit");
  const nextInventoryQuantityValue = watch("nextInventoryQuantity");
  const previousCategoryRef = useRef("");
  const subcategoryGuardInitializedRef = useRef(false);

  // Фільтруємо МВО по вибраному центру
  const filteredResponsiblePersons = useMemo(() => {
    if (!selectedRespCenter || !responsibilityCenters.length || !responsiblePersons.length) {
      return [];
    }
    const centerObj = responsibilityCenters.find(
      (c) => String(c?.name || c?.centerName || c?.center_name || "").trim() === String(selectedRespCenter || "").trim()
    );
    if (!centerObj) return [];

    const centerId = String(centerObj?.id || centerObj?.centerId || centerObj?.center_id || "").trim();
    if (!centerId) return [];

    return responsiblePersons
      .filter(
        (p) => String(p?.centerId || p?.center_id || "").trim() === centerId
      )
      .map((p) => String(p?.name || p?.personName || p?.person_name || "").trim())
      .filter(Boolean);
  }, [selectedRespCenter, responsibilityCenters, responsiblePersons]);

  const ensureCurrentOption = (options = [], currentValue = "") => {
    const normalized = Array.from(
      new Set(
        (Array.isArray(options) ? options : [])
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
    );

    const current = String(currentValue || "").trim();
    if (current && !normalized.includes(current)) {
      return [current, ...normalized];
    }

    return normalized;
  };

  const normalizeText = (value) => String(value || "").trim().toLowerCase();

  const findRestaurantByLocation = (locationValue) => {
    const target = normalizeText(locationValue);
    if (!target) return null;

    return (
      restaurants.find((r) => {
        const byName = normalizeText(r?.name) === target;
        const byId = String(r?.id || "").trim().toLowerCase() === target;
        const byRegNumber = String(r?.regNumber || r?.reg_number || "").trim().toLowerCase() === target;
        const fuzzyName = normalizeText(r?.name).includes(target) || target.includes(normalizeText(r?.name));
        return byName || byId || byRegNumber || fuzzyName;
      }) || null
    );
  };

  const filteredSubcategories = useMemo(() => {
    if (!Array.isArray(subcategoryItems) || subcategoryItems.length === 0) {
      return subcategories;
    }

    const normalizedCategory = String(selectedCategory || "").trim();
    const visibleItems = !normalizedCategory
      ? subcategoryItems
      : subcategoryItems.filter((item) => {
          const itemCategory = String(item.categoryName || "").trim();
          if (!itemCategory) {
            return true;
          }
          return itemCategory === normalizedCategory;
        });

    const names = visibleItems
      .map((item) => String(item.name || "").trim())
      .filter(Boolean);

    return Array.from(new Set(names));
  }, [subcategoryItems, subcategories, selectedCategory]);

  useEffect(() => {
    const normalizedCategory = String(selectedCategory || "").trim();

    // Reinitialize guard when switching between assets/new form,
    // so existing saved values are not cleared on first render.
    if (!subcategoryGuardInitializedRef.current) {
      previousCategoryRef.current = normalizedCategory;
      subcategoryGuardInitializedRef.current = true;
      return;
    }

    const hasCategoryChanged = previousCategoryRef.current !== normalizedCategory;

    if (hasCategoryChanged && selectedSubCategory && !filteredSubcategories.includes(selectedSubCategory)) {
      setValue("subCategory", "");
    }

    previousCategoryRef.current = normalizedCategory;
  }, [selectedCategory, selectedSubCategory, filteredSubcategories, setValue]);

  useEffect(() => {
    subcategoryGuardInitializedRef.current = false;
  }, [selectedAsset?.id]);

  const normalizePhotosForState = (items) => {
    if (!Array.isArray(items)) return [];
    return items
      .map((item, index) => {
        if (typeof item === "string") {
          return { url: item, name: `Фото ${index + 1}` };
        }
        if (item && typeof item === "object") {
          return {
            url: typeof item.url === "string" ? item.url : "",
            name: typeof item.name === "string" ? item.name : `Фото ${index + 1}`,
          };
        }
        return { url: "", name: "" };
      })
      .filter((item) => item.url);
  };

  useEffect(() => {
    if (selectedAsset) {
      const normalizedSelectedAsset = {
        ...selectedAsset,
        invNumber:
          selectedAsset?.invNumber ??
          selectedAsset?.inv_number ??
          "",
        invNumber1C:
          selectedAsset?.invNumber1C ??
          selectedAsset?.inv_number_1c ??
          selectedAsset?.inv_number1_c ??
          "",
        name:
          selectedAsset?.name ??
          selectedAsset?.assetName ??
          selectedAsset?.asset_name ??
          "",
        subCategory:
          selectedAsset?.subCategory ??
          selectedAsset?.sub_category ??
          "",
        serialNumber:
          selectedAsset?.serialNumber ??
          selectedAsset?.serial_number ??
          "",
        businessUnit:
          selectedAsset?.businessUnit ??
          selectedAsset?.business_unit ??
          "",
        locationName:
          selectedAsset?.locationName ??
          selectedAsset?.location_name ??
          selectedAsset?.restaurant_name ??
          "",
        respCenter:
          selectedAsset?.respCenter ??
          selectedAsset?.resp_center ??
          "",
        respPerson:
          selectedAsset?.respPerson ??
          selectedAsset?.resp_person ??
          "",
        purchaseYear:
          selectedAsset?.purchaseYear ??
          selectedAsset?.purchase_year ??
          "",
        commissionDate:
          selectedAsset?.commissionDate ??
          selectedAsset?.commission_date ??
          "",
        normativeTerm:
          selectedAsset?.normativeTerm ??
          selectedAsset?.normative_term ??
          "",
        physicalWear:
          selectedAsset?.physicalWear ??
          selectedAsset?.physical_wear ??
          "",
        moralWear:
          selectedAsset?.moralWear ??
          selectedAsset?.moral_wear ??
          "",
        totalWear:
          selectedAsset?.totalWear ??
          selectedAsset?.total_wear ??
          "",
        initialCost:
          selectedAsset?.initialCost ??
          selectedAsset?.initial_cost ??
          "",
        marketValueNew:
          selectedAsset?.marketValueNew ??
          selectedAsset?.market_value_new ??
          "",
        marketValueUsed:
          selectedAsset?.marketValueUsed ??
          selectedAsset?.market_value_used ??
          "",
        residualValuePerUnit:
          selectedAsset?.residualValuePerUnit ??
          selectedAsset?.residual_value_per_unit ??
          "",
        residualValue:
          selectedAsset?.residualValue ??
          selectedAsset?.residual_value ??
          "",
        newLocation:
          selectedAsset?.newLocation ??
          selectedAsset?.new_location ??
          "",
        auditDate:
          selectedAsset?.auditDate ??
          selectedAsset?.audit_date ??
          defaultAsset.auditDate,
        inventoryQuantity:
          selectedAsset?.inventoryQuantity ??
          selectedAsset?.inventory_quantity ??
          "",
        nextInventoryQuantity:
          selectedAsset?.nextInventoryQuantity ??
          selectedAsset?.next_inventory_quantity ??
          "",
      };

      const normalizedInventoryQty = Number(normalizedSelectedAsset?.inventoryQuantity);
      const normalizedResidualTotal = Number(normalizedSelectedAsset?.residualValue);
      const derivedResidualPerUnit =
        Number.isFinite(normalizedInventoryQty) &&
        normalizedInventoryQty > 0 &&
        Number.isFinite(normalizedResidualTotal)
          ? normalizedResidualTotal / normalizedInventoryQty
          : "";

      reset({
        ...defaultAsset,
        ...normalizedSelectedAsset,
        residualValuePerUnit:
          normalizedSelectedAsset?.residualValuePerUnit !== undefined &&
          normalizedSelectedAsset?.residualValuePerUnit !== null &&
          String(normalizedSelectedAsset?.residualValuePerUnit).trim() !== ""
            ? normalizedSelectedAsset.residualValuePerUnit
            : derivedResidualPerUnit,
      });
      setPhotos(normalizePhotosForState(normalizedSelectedAsset.photos));
    } else {
      // При створенні нового активу підставляємо ресторан користувача
      const userRestaurantKey =
        currentUser?.restaurant ||
        currentUser?.restaurantId ||
        currentUser?.restaurant_id ||
        currentUser?.restaurantName ||
        currentUser?.restaurant_name ||
        "";
      const userRestaurant =
        Array.isArray(restaurants) && restaurants.length === 1
          ? restaurants[0]
          : userRestaurantKey
            ? findRestaurantByLocation(userRestaurantKey)
            : null;
      
      reset({
        ...defaultAsset,
        locationName: userRestaurant?.name || "",
        businessUnit: String(userRestaurant?.businessUnit || "").trim(),
      });
      setPhotos([]);
    }
  }, [selectedAsset, reset, currentUser, restaurants]);

  // Функція для генерації інвентарного номеру
  const generateInvNumber = (locationName, allAssets) => {
    // Знаходимо ресторан по назві локації
    const restaurant = findRestaurantByLocation(locationName);
    if (!restaurant) return "";

    // Беремо перші 3 символи облікового номеру
    const prefix = String(restaurant?.regNumber || "").substring(0, 3);
    if (!prefix) return "";

    // Знаходимо всі активи цього ресторану
    const restaurantAssets = allAssets.filter((a) => normalizeText(a?.locationName) === normalizeText(locationName));

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

    const locationName = selectedLocationName;
    if (locationName) {
      // Генеруємо інвентарний номер
      const newInvNumber = generateInvNumber(locationName, assetsProp);
      if (newInvNumber) {
        setValue("invNumber", newInvNumber);
      }
      
      // Автозаповнюємо бізнес-напрям з ресторану
      const restaurant = findRestaurantByLocation(locationName);
      if (restaurant && restaurant.businessUnit) {
        setValue("businessUnit", restaurant.businessUnit);
      }
    }
  }, [selectedLocationName, restaurants, setValue, assetsProp]);

  const physicalWear = watch("physicalWear");
  const moralWear = watch("moralWear");
  const invNumberValue = watch("invNumber");
  const nameValue = watch("name");
  const initialNameValue = String(selectedAsset?.name || "").trim();
  const currentNameValue = String(nameValue || "").trim();
  const isNameChangedInEdit = isEdit && currentNameValue !== initialNameValue;
  const currentQrFingerprint = `${String(invNumberValue || "").trim()}::${String(nameValue || "").trim()}`;
  const hasPrintedQr = Boolean(
    String(invNumberValue || "").trim() &&
    String(nameValue || "").trim() &&
    printedQrFingerprint === currentQrFingerprint
  );
  const requiresQrPrintBeforeSave = isNameChangedInEdit;
  const savedPrimaryInventoryQuantityRaw =
    selectedAsset?.inventoryQuantity ??
    selectedAsset?.inventory_quantity ??
    "";
  const hasSavedPrimaryInventoryQuantity =
    isEdit &&
    savedPrimaryInventoryQuantityRaw !== undefined &&
    savedPrimaryInventoryQuantityRaw !== null &&
    String(savedPrimaryInventoryQuantityRaw).trim() !== "";

  const inventoryDifference = useMemo(() => {
    if (!hasSavedPrimaryInventoryQuantity) return "";
    const baseQty = Number(savedPrimaryInventoryQuantityRaw);
    const nextQtyRaw = String(nextInventoryQuantityValue ?? "").trim();
    if (!nextQtyRaw) return "";
    const nextQty = Number(nextQtyRaw);
    if (!Number.isFinite(baseQty) || !Number.isFinite(nextQty)) return "";
    return nextQty - baseQty;
  }, [hasSavedPrimaryInventoryQuantity, nextInventoryQuantityValue, savedPrimaryInventoryQuantityRaw]);

  const effectiveQuantityForValue = useMemo(() => {
    if (hasSavedPrimaryInventoryQuantity) {
      const nextRaw = String(nextInventoryQuantityValue ?? "").trim();
      if (nextRaw) {
        const next = Number(nextRaw);
        if (Number.isFinite(next)) return next;
      }
      const current = Number(savedPrimaryInventoryQuantityRaw);
      return Number.isFinite(current) ? current : 0;
    }

    const primaryRaw = String(inventoryQuantityValue ?? "").trim();
    if (!primaryRaw) return 0;
    const primary = Number(primaryRaw);
    return Number.isFinite(primary) ? primary : 0;
  }, [hasSavedPrimaryInventoryQuantity, nextInventoryQuantityValue, savedPrimaryInventoryQuantityRaw, inventoryQuantityValue]);

  const residualValueTotalComputed = useMemo(() => {
    const perUnit = Number(String(residualValuePerUnitValue ?? "").trim());
    if (!Number.isFinite(perUnit) || perUnit < 0) return 0;
    if (!Number.isFinite(effectiveQuantityForValue) || effectiveQuantityForValue <= 0) return 0;
    return Math.round(perUnit * effectiveQuantityForValue * 100) / 100;
  }, [residualValuePerUnitValue, effectiveQuantityForValue]);

  useEffect(() => {
    setValue("residualValue", residualValueTotalComputed);
  }, [residualValueTotalComputed, setValue]);

  useEffect(() => {
    setPrintedQrFingerprint("");
  }, [selectedAsset?.id]);

  useEffect(() => {
    const phys = Number(physicalWear) || 0;
    const moral = Number(moralWear) || 0;
    const avg = Math.max(0, Math.min(100, Math.round((phys + moral) / 2)));
    setValue("totalWear", avg);
  }, [physicalWear, moralWear, setValue]);

  // У режимі редагування дозволяємо переміщення по вкладках без обмежень
  const canAccessTab = (tabId) => {
    if (isEdit) return true;
    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === 0) return true;
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
  const compressImageToDataUrl = async (file) => {
    const readAsDataUrl = (inputFile) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(inputFile);
      });

    const loadImage = (src) =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });

    const sourceDataUrl = await readAsDataUrl(file);
    const image = await loadImage(sourceDataUrl);

    const MAX_SIDE = 1280;
    const TARGET_MAX_BYTES = 180 * 1024;
    const MIN_SIDE = 700;

    const canvasToBlob = (canvasEl, mimeType, quality) =>
      new Promise((resolve) => {
        canvasEl.toBlob((blob) => resolve(blob), mimeType, quality);
      });

    const blobToDataUrl = (blob) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

    let width = image.naturalWidth || image.width;
    let height = image.naturalHeight || image.height;

    if (width > MAX_SIDE || height > MAX_SIDE) {
      const ratio = Math.min(MAX_SIDE / width, MAX_SIDE / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      return sourceDataUrl;
    }

    const draw = (drawWidth, drawHeight) => {
      canvas.width = drawWidth;
      canvas.height = drawHeight;
      context.clearRect(0, 0, drawWidth, drawHeight);
      context.drawImage(image, 0, 0, drawWidth, drawHeight);
    };

    draw(width, height);

    let quality = 0.82;
    let outputBlob = await canvasToBlob(canvas, "image/jpeg", quality);

    while (outputBlob && outputBlob.size > TARGET_MAX_BYTES && quality > 0.48) {
      quality -= 0.07;
      outputBlob = await canvasToBlob(canvas, "image/jpeg", quality);
    }

    while (
      outputBlob &&
      outputBlob.size > TARGET_MAX_BYTES &&
      width > MIN_SIDE &&
      height > MIN_SIDE
    ) {
      width = Math.round(width * 0.86);
      height = Math.round(height * 0.86);
      draw(width, height);
      outputBlob = await canvasToBlob(canvas, "image/jpeg", Math.max(quality, 0.55));
    }

    if (!outputBlob) {
      return sourceDataUrl;
    }

    return await blobToDataUrl(outputBlob);
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setProcessingPhotos(true);

    const preparedPhotos = [];
    let failedCount = 0;

    for (const file of files) {
      try {
        if (!String(file.type || "").startsWith("image/")) {
          failedCount += 1;
          continue;
        }

        const compressedDataUrl = await compressImageToDataUrl(file);
        preparedPhotos.push({ url: compressedDataUrl, name: file.name });
      } catch (error) {
        console.error("Помилка обробки фото:", error);
        failedCount += 1;
      }
    }

    if (preparedPhotos.length > 0) {
      setPhotos((prev) => [...prev, ...preparedPhotos]);
    }

    if (failedCount > 0) {
      alert(`Не вдалося обробити ${failedCount} фото.`);
    }

    setProcessingPhotos(false);
    e.target.value = "";
  };

  const handleCameraCapture = (e) => {
    handlePhotoUpload(e);
  };

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmitForm = async (values) => {
    const safeString = (input) => {
      if (input === null || input === undefined) return "";
      return typeof input === "string" ? input : String(input);
    };

    const toSafeNumber = (input, fallback = 0) => {
      const parsed = Number(input);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const toOptionalNumber = (input) => {
      const normalized = String(input ?? "").trim();
      if (!normalized) return null;
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const sanitizePhotoUrls = (items) => {
      const MAX_PHOTOS = 5;
      const MAX_SINGLE_PHOTO_CHARS = 220000;
      const MAX_TOTAL_CHARS = 700000;

      if (!Array.isArray(items)) {
        return { urls: [], droppedCount: 0 };
      }

      const normalized = items
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && typeof item.url === "string") return item.url;
          return "";
        })
        .filter((url) => Boolean(url));

      const accepted = [];
      let totalChars = 0;
      let droppedCount = 0;

      for (const url of normalized) {
        const isTooLargeSingle = url.length > MAX_SINGLE_PHOTO_CHARS;
        const isOverCount = accepted.length >= MAX_PHOTOS;
        const isOverTotal = totalChars + url.length > MAX_TOTAL_CHARS;

        if (isTooLargeSingle || isOverCount || isOverTotal) {
          droppedCount += 1;
          continue;
        }

        accepted.push(url);
        totalChars += url.length;
      }

      return { urls: accepted, droppedCount };
    };

    const stripUndefinedDeep = (input) => {
      if (Array.isArray(input)) {
        return input
          .map(stripUndefinedDeep)
          .filter((item) => item !== undefined);
      }

      if (input && typeof input === "object") {
        return Object.entries(input).reduce((acc, [key, value]) => {
          if (value === undefined) return acc;
          const normalized = stripUndefinedDeep(value);
          if (normalized !== undefined) {
            acc[key] = normalized;
          }
          return acc;
        }, {});
      }

      return input;
    };

    const { urls: safePhotoUrls, droppedCount } = sanitizePhotoUrls(photos);

    let resolvedPhotoUrls = safePhotoUrls;
    if (isAssetsApiEnabled()) {
      const uploadResults = [];
      let uploadFailed = 0;

      for (let index = 0; index < safePhotoUrls.length; index += 1) {
        const photoUrl = String(safePhotoUrls[index] || "");

        if (!photoUrl.startsWith("data:image/")) {
          uploadResults.push(photoUrl);
          continue;
        }

        try {
          const sourceName = photos[index]?.name || `asset-photo-${index + 1}.jpg`;
          const uploaded = await uploadAssetPhotoApi({ fileName: sourceName, dataUrl: photoUrl });
          if (uploaded.url) {
            uploadResults.push(uploaded.url);
          } else {
            uploadFailed += 1;
          }
        } catch (error) {
          console.error("Помилка аплоаду фото активу:", error);
          uploadFailed += 1;
        }
      }

      resolvedPhotoUrls = uploadResults;

      if (uploadFailed > 0) {
        alert(`Не вдалося зберегти ${uploadFailed} фото на сервері. Збереження продовжено для решти.`);
      }
    }

    // Конвертація числової дати (Excel serial) у dd.mm.yyyy
    const excelSerialToDate = (serial) => {
      const n = Number(serial);
      if (!Number.isFinite(n) || n < 10000) return String(serial);
      // Excel: 1 = 1900-01-01
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + n * 86400000);
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = date.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    };

    const currentPrimaryQuantity = hasSavedPrimaryInventoryQuantity
      ? toOptionalNumber(savedPrimaryInventoryQuantityRaw)
      : toOptionalNumber(values.inventoryQuantity);
    const nextInventoryQuantity = toOptionalNumber(values.nextInventoryQuantity);
    const effectiveInventoryQuantity =
      hasSavedPrimaryInventoryQuantity && nextInventoryQuantity !== null
        ? nextInventoryQuantity
        : currentPrimaryQuantity;

    const residualValuePerUnit = toSafeNumber(values.residualValuePerUnit, 0);
    const residualValueTotal =
      Number.isFinite(residualValuePerUnit) && Number.isFinite(effectiveInventoryQuantity) && effectiveInventoryQuantity > 0
        ? Math.round(residualValuePerUnit * effectiveInventoryQuantity * 100) / 100
        : 0;

    const payload = {
      id: selectedAsset?.id,
      invNumber: safeString(values.invNumber).trim(),
      invNumber1C: safeString(values.invNumber1C).trim(),
      name: safeString(values.name).trim(),
      category: safeString(values.category).trim(),
      subCategory: safeString(values.subCategory).trim(),
      type: safeString(values.type).trim(),
      inventoryQuantity: effectiveInventoryQuantity ?? "",
      nextInventoryQuantity: "",
      serialNumber: safeString(values.serialNumber).trim(),
      brand: safeString(values.brand).trim(),
      photos: resolvedPhotoUrls,
      businessUnit: safeString(values.businessUnit).trim(),
      locationName: safeString(values.locationName).trim(),
      zone: safeString(values.zone).trim(),
      respCenter: safeString(values.respCenter).trim(),
      respPerson: typeof values.respPerson === "string" ? values.respPerson : "",
      status: safeString(values.status).trim(),
      condition: safeString(values.condition).trim(),
      purchaseYear: excelSerialToDate(values.purchaseYear),
      commissionDate: excelSerialToDate(values.commissionDate),
      functionality: safeString(values.functionality).trim(),
      relevance: safeString(values.relevance).trim(),
      comment: safeString(values.comment).trim(),
      purchaseYear: safeString(values.purchaseYear).trim(),
      commissionDate: safeString(values.commissionDate).trim(),
      normativeTerm: values.normativeTerm === "" ? "" : toSafeNumber(values.normativeTerm, ""),
      physicalWear: toSafeNumber(values.physicalWear, 0),
      moralWear: toSafeNumber(values.moralWear, 0),
      totalWear: toSafeNumber(values.totalWear, 0),
      initialCost: toSafeNumber(values.initialCost, 0),
      marketValueNew: toSafeNumber(values.marketValueNew, 0),
      marketValueUsed: toSafeNumber(values.marketValueUsed, 0),
      residualValuePerUnit,
      residualValue: residualValueTotal,
      decision: safeString(values.decision).trim(),
      reason: safeString(values.reason).trim(),
      reasonComment: safeString(values.reasonComment).trim(),
      newLocation: safeString(values.newLocation).trim(),
      auditDate: safeString(values.auditDate).trim(),
      auditors: safeString(values.auditors).trim(),
    };

    if (droppedCount > 0) {
      alert(`Частину фото (${droppedCount}) не збережено через обмеження розміру. Рекомендується стискати фото перед завантаженням.`);
    }

    const saved = await onSubmit(stripUndefinedDeep(payload));
    if (saved !== false) {
      setActiveTab("identification");
      setCompletedTabs([]);
      setPhotos([]);
    }
  };

  const requiredMark = <span className="text-rose-500">*</span>;

  const isMove = watch("decision") === "Перемістити";
  const currentTabIndex = tabs.findIndex((t) => t.id === activeTab);
  const isFirstTab = currentTabIndex === 0;
  const isLastTab = currentTabIndex === tabs.length - 1;

  return (
    <div className="card p-3 sm:p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{isEdit ? "Редагування актива" : "Додати актив"}</h2>
          <p className="text-sm text-slate-500 mt-1">
            Крок {currentTabIndex + 1} з {tabs.length} • Заповнюйте поля послідовно
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-slate-600">
          <ClipboardCheck size={16} /> {completedTabs.length} / {tabs.length} завершено
        </div>
      </div>

      <div className="mt-3 sm:mt-4 flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-4 sm:gap-2 sm:overflow-visible sm:pb-0">
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
                "relative shrink-0 snap-start min-w-[120px] sm:min-w-0 rounded-md sm:rounded-lg px-2.5 sm:px-4 py-2 sm:py-3.5 text-[13px] sm:text-sm font-bold leading-tight transition-all duration-200 border-2",
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

      <form className="mt-4 sm:mt-6 flex flex-col gap-4 sm:gap-6" onSubmit={handleSubmit(onSubmitForm)}>
        {activeTab === "identification" && (
          <div className="space-y-6">
            <FieldGrid>
              <Input 
                label={<>Інвентарний номер {requiredMark}</>} 
                {...register("invNumber", { required: true })}
                disabled={
                  // Для адміна завжди доступно
                  fieldPermsLoading ||
                  (!isAdmin && isEdit) ||
                  (!isAdmin && !canEdit("invNumber"))
                }
              />
              <Input
                label="Інвентарний номер 1С"
                {...register("invNumber1C")}
                disabled={fieldPermsLoading || !canEdit("invNumber1C")}
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
                options={ensureCurrentOption(
                  categories.length > 0 ? categories : ["Кухня", "Бар", "IT", "Меблі", "Транспорт"],
                  selectedCategory
                )}
              />
              <Select
                label="Підкатегорія"
                {...register("subCategory")}
                options={ensureCurrentOption(filteredSubcategories.length > 0 ? filteredSubcategories : [], selectedSubCategory)}
              />
              <Select
                label="Тип обліку"
                {...register("type")}
                options={ensureCurrentOption(accountingTypes.length > 0 ? accountingTypes : ["ОС", "МШП"], selectedType)}
              />
              <Input
                label="Первинна інвентаризаційна кількість"
                type="number"
                min="0"
                step="1"
                {...register("inventoryQuantity")}
                disabled={hasSavedPrimaryInventoryQuantity}
              />
              <div className="flex min-w-0 items-center gap-2.5 text-sm">
                <span className="w-40 lg:w-44 shrink-0 text-[13px] leading-tight font-semibold text-slate-800">
                  Інвентаризаційна кількість (наступна)
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={clsx(
                      baseInput,
                      "min-w-0 max-w-full w-full",
                      !hasSavedPrimaryInventoryQuantity && "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200"
                    )}
                    disabled={!hasSavedPrimaryInventoryQuantity}
                    {...register("nextInventoryQuantity")}
                  />
                  {hasSavedPrimaryInventoryQuantity && inventoryDifference !== "" && (
                    <div className={clsx("text-xs font-semibold", inventoryDifference > 0 ? "text-emerald-700" : inventoryDifference < 0 ? "text-rose-700" : "text-slate-600")}>
                      Різниця: {inventoryDifference > 0 ? "+" : ""}{inventoryDifference}
                    </div>
                  )}
                  {!hasSavedPrimaryInventoryQuantity && (
                    <div className="text-xs text-slate-500">Доступно після збереження первинної кількості.</div>
                  )}
                </div>
              </div>
              <Input label="Серійний номер" {...register("serialNumber")}/>
              <Input label="Виробник / бренд" {...register("brand")}/>
            </FieldGrid>

            {/* Блок завантаження фото */}
            <div className="border-t-2 border-slate-200 pt-4 sm:pt-6">
              <h3 className="text-sm sm:text-lg font-semibold text-slate-800 mb-2 sm:mb-4">Фотографії активу</h3>
              
              <div className="flex flex-nowrap gap-2 mb-2 sm:mb-4">
                {/* Кнопка завантаження з файлу */}
                <label className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-3 rounded-md sm:rounded-lg bg-blue-600 text-white text-[12px] sm:text-sm font-semibold hover:bg-blue-500 cursor-pointer transition shadow">
                  <Upload size={14} className="sm:w-[18px] sm:h-[18px]" />
                  {processingPhotos ? "Обробка..." : "Завантажити фото"}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={processingPhotos}
                  />
                </label>

                {/* Кнопка камери (для мобільних) */}
                <label className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-3 rounded-md sm:rounded-lg bg-green-600 text-white text-[12px] sm:text-sm font-semibold hover:bg-green-500 cursor-pointer transition shadow">
                  <Camera size={14} className="sm:w-[18px] sm:h-[18px]" />
                  {processingPhotos ? "Обробка..." : "Зробити фото"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleCameraCapture}
                    disabled={processingPhotos}
                  />
                </label>
              </div>

              {/* Превʼю фотографій */}
              {photos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
                  {photos.map((photo, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={photo.url}
                        alt={`Фото ${index + 1}`}
                        className="w-full h-20 sm:h-32 object-cover rounded-md sm:rounded-lg border border-slate-300 sm:border-2 shadow"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        aria-label={`Видалити фото ${index + 1}`}
                        className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 inline-flex items-center justify-center w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-red-600 text-white hover:bg-red-700 active:scale-95 transition shadow-lg"
                      >
                        <X size={12} className="sm:w-4 sm:h-4" />
                      </button>
                      <p className="text-[10px] sm:text-xs text-slate-600 mt-0.5 sm:mt-1 truncate">{photo.name}</p>
                    </div>
                  ))}
                </div>
              )}

              {photos.length === 0 && (
                <div className="text-center py-4 sm:py-8 border border-dashed sm:border-2 border-slate-300 rounded-md sm:rounded-lg bg-slate-50">
                  <Camera size={28} className="mx-auto mb-1 sm:mb-2 text-slate-400 sm:w-12 sm:h-12" />
                  <p className="text-xs sm:text-base text-slate-600">Немає завантажених фото</p>
                  <p className="text-[11px] sm:text-sm text-slate-500">Завантажте фото активу для ідентифікації</p>
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
              options={ensureCurrentOption(
                businessUnits.length > 0 ? businessUnits : ["Ресторан", "Кав'ярня", "Кейтеринг", "Офіс", "Склад"],
                selectedBusinessUnit
              )}
            />
            <Select
              label={<>Назва локації (Ресторан) {requiredMark}</>}
              {...register("locationName", { required: true })}
              options={ensureCurrentOption(restaurants.map((r) => r.name), selectedLocationName)}
            />
            <Select
              label="Зона розміщення"
              {...register("zone")}
              options={ensureCurrentOption(
                placementZones.length > 0 ? placementZones : ["Зал", "Кухня", "Бар", "Склад", "Адміністрація"],
                selectedZone
              )}
            />
            <Select
              label="Центр відповідальності"
              {...register("respCenter")}
              options={ensureCurrentOption(
                responsibilityCenters.length > 0 ? responsibilityCenters.map(c => c.name) : ["Відділ ІТ", "Бухгалтерія", "HR", "Маркетинг"],
                selectedRespCenter
              )}
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
              options={ensureCurrentOption(
                statuses.length > 0 ? statuses : ["В експлуатації", "Не використовується", "Законсервований"],
                selectedStatus
              )}
            />
            <Select
              label="Фактичний стан"
              {...register("condition")}
              options={ensureCurrentOption(
                conditions.length > 0 ? conditions : ["Новий", "Добрий", "Задовільний", "Критичний"],
                selectedCondition
              )}
            />
            <Select
              label="Працездатність"
              {...register("functionality")}
              options={ensureCurrentOption(
                functionalities.length > 0 ? functionalities : ["Працює", "Частково", "Не працює"],
                selectedFunctionality
              )}
            />
            <Select
              label="Моральна актуальність"
              {...register("relevance")}
              options={ensureCurrentOption(
                relevances.length > 0 ? relevances : ["Актуальний", "Частково застарілий", "Застарілий"],
                selectedRelevance
              )}
            />
            <Textarea label="Коментар по стану" {...register("comment")} rows={3} />
          </FieldGrid>
        )}

        {activeTab === "dates" && (
          <FieldGrid>
            <Input
              type="date"
              label="Дата придбання"
              {...register("purchaseYear")}
              value={(() => {
                const v = watch("purchaseYear");
                if (!v) return "";
                if (/^\d{2}\.\d{2}\.\d{4}$/.test(v)) {
                  const [d, m, y] = v.split(".");
                  return `${y}-${m}-${d}`;
                }
                // Excel serial number
                const n = Number(v);
                if (Number.isFinite(n) && n > 10000) {
                  const excelEpoch = new Date(1899, 11, 30);
                  const date = new Date(excelEpoch.getTime() + n * 86400000);
                  const yyyy = date.getFullYear();
                  const mm = String(date.getMonth() + 1).padStart(2, '0');
                  const dd = String(date.getDate()).padStart(2, '0');
                  return `${yyyy}-${mm}-${dd}`;
                }
                return v;
              })()}
            />
            <Input
              type="date"
              label="Дата введення в експлуатацію"
              {...register("commissionDate")}
              value={(() => {
                const v = watch("commissionDate");
                if (!v) return "";
                if (/^\d{2}\.\d{2}\.\d{4}$/.test(v)) {
                  const [d, m, y] = v.split(".");
                  return `${y}-${m}-${d}`;
                }
                // Excel serial number
                const n = Number(v);
                if (Number.isFinite(n) && n > 10000) {
                  const excelEpoch = new Date(1899, 11, 30);
                  const date = new Date(excelEpoch.getTime() + n * 86400000);
                  const yyyy = date.getFullYear();
                  const mm = String(date.getMonth() + 1).padStart(2, '0');
                  const dd = String(date.getDate()).padStart(2, '0');
                  return `${yyyy}-${mm}-${dd}`;
                }
                return v;
              })()}
            />
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
              name="residualValuePerUnit"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <CurrencyInput
                  label={<>Управлінська залишкова вартість за 1 шт {requiredMark}</>}
                  {...field}
                  error={errors.residualValuePerUnit}
                />
              )}
            />
            <Controller
              name="residualValue"
              control={control}
              render={({ field }) => (
                <CurrencyInput
                  label={<>Сума по актуальній кількості (авто)</>}
                  {...field}
                  value={residualValueTotalComputed}
                  disabled
                  readOnly
                />
              )}
            />
            <div className="md:col-span-2 lg:col-span-3 text-xs text-slate-600">
              Актуальна кількість для розрахунку: <span className="font-semibold">{effectiveQuantityForValue}</span>
            </div>
          </FieldGrid>
        )}

        {activeTab === "decision" && (
          <FieldGrid>
            <Select
              label={<>Рішення {requiredMark}</>}
              {...register("decision", { required: true })}
              options={ensureCurrentOption(
                decisions.length > 0 ? decisions : ["Залишити", "Списати", "Продати", "Перемістити"],
                selectedDecision
              )}
            />
            <Select
              label="Причина"
              {...register("reason")}
              options={ensureCurrentOption(
                reasons.length > 0 ? reasons : ["Знос", "Надлишок", "Непридатність"],
                selectedReason
              )}
            />
            <Textarea label="Коментар до причини" {...register("reasonComment")} rows={2} />
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
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 border-t-2 border-indigo-700 pt-3 sm:pt-4">
          <div className="flex items-center gap-2 sm:gap-3">
            {!isFirstTab && (
              <button
                type="button"
                onClick={handlePrev}
                className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-3 rounded-md sm:rounded-lg font-bold text-sm sm:text-base bg-slate-200 text-slate-700 hover:bg-slate-300 transition-all duration-200 shadow"
              >
                <ChevronLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
                Назад
              </button>
            )}
            
            {!isLastTab && (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-3 rounded-md sm:rounded-lg font-bold text-sm sm:text-base bg-indigo-600 text-white hover:bg-indigo-500 transition-all duration-200 shadow-xl shadow-indigo-500/50"
              >
                Далі
                <ChevronRight size={16} className="sm:w-[18px] sm:h-[18px]" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-sm font-bold text-rose-400">
              {Object.keys(errors).length > 0 && "Заповніть обовʼязкові поля"}
            </div>
            
            {isLastTab && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await printAssetQrLabel({
                        invNumber: invNumberValue,
                        name: nameValue,
                        qrValue: invNumberValue,
                      });
                      setPrintedQrFingerprint(currentQrFingerprint);
                    } catch (error) {
                      alert(error.message || "Не вдалося надрукувати QR код");
                    }
                  }}
                  className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3.5 rounded-md sm:rounded-lg font-bold text-sm sm:text-base bg-gradient-to-r from-indigo-600 to-indigo-700 border-2 border-indigo-500 text-white hover:from-indigo-500 hover:to-indigo-600 hover:border-indigo-400 transition-all duration-200 shadow-xl shadow-indigo-500/50"
                >
                  <Printer size={16} className="sm:w-[18px] sm:h-[18px]" />
                  Друк QR
                </button>
                <button
                  type="submit"
                  disabled={requiresQrPrintBeforeSave && !hasPrintedQr}
                  className={clsx(
                    "inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3.5 rounded-md sm:rounded-lg font-bold text-sm sm:text-base border-2 transition-all duration-200 shadow-xl",
                    !requiresQrPrintBeforeSave || hasPrintedQr
                      ? "bg-gradient-to-r from-green-600 to-green-700 border-green-500 text-white hover:from-green-500 hover:to-green-600 hover:border-green-400 shadow-green-500/50 hover:shadow-green-400/70"
                      : "bg-slate-300 border-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                  )}
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin sm:w-[18px] sm:h-[18px]" /> : <Save size={16} className="sm:w-[18px] sm:h-[18px]" />}
                  Зберегти актив
                </button>
              </>
            )}
          </div>
        </div>
        {isLastTab && requiresQrPrintBeforeSave && !hasPrintedQr && (
          <div className="text-xs sm:text-sm text-amber-600 font-semibold">
            Ви змінили назву активу. Перед збереженням потрібно роздрукувати QR етикетку.
          </div>
        )}
      </form>
    </div>
  );
}

function FieldGrid({ children }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

// Light, high-contrast inputs for better readability on dark container
const baseInput = "w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-[13px] leading-tight text-gray-900 font-medium shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-150 placeholder:text-gray-500";

const Input = ({ label, disabled, type = "text", ...rest }) => (
  <label className="flex min-w-0 items-center gap-2.5 text-sm">
    <span className="w-40 lg:w-44 shrink-0 text-[13px] leading-tight font-semibold text-slate-800">
      {label}
    </span>
    <input 
      type={type}
      disabled={disabled} 
      className={clsx(
        baseInput,
        "min-w-0 max-w-full flex-1",
        type === "date" && "[color-scheme:light]",
        disabled && "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200"
      )}
      {...rest} 
    />
  </label>
);

const Select = ({ label, options = [], ...rest }) => (
  <label className="flex min-w-0 items-center gap-2.5 text-sm">
    <span className="w-40 lg:w-44 shrink-0 text-[13px] leading-tight font-semibold text-slate-800">
      {label}
    </span>
    <select className={clsx(baseInput, "min-w-0 max-w-full flex-1 appearance-none cursor-pointer pr-8 bg-right bg-no-repeat [&>option]:bg-white [&>option]:text-gray-900 [&>option]:py-3 [&>option]:font-medium")} {...rest}>
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
  <label className="flex min-w-0 items-start gap-2.5 text-sm">
    <span className="w-40 lg:w-44 shrink-0 text-[13px] leading-tight font-semibold text-slate-800 pt-1">{label}</span>
    <textarea rows={rows} className={`${baseInput} min-w-0 flex-1 resize-none min-h-[72px]`} {...rest} />
  </label>
);
