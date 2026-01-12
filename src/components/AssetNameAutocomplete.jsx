import { forwardRef, useState, useEffect, useRef } from "react";
import { Search, CheckCircle } from "lucide-react";

const AssetNameAutocomplete = forwardRef(({ 
  label, 
  error, 
  assets = [], 
  onSelectAsset,
  disabled,
  ...props 
}, ref) => {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef(null);

  // Закриваємо підказки при кліку поза компонентом
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Синхронізуємо з зовнішнім value
  useEffect(() => {
    if (props.value !== undefined && props.value !== inputValue) {
      setInputValue(props.value);
    }
  }, [props.value]);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    
    if (props.onChange) {
      props.onChange(e);
    }

    // Шукаємо схожі активи
    if (value.trim().length >= 2) {
      const uniqueAssets = getUniqueSimilarAssets(value);
      setSuggestions(uniqueAssets);
      setShowSuggestions(uniqueAssets.length > 0);
      setSelectedIndex(-1);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const getUniqueSimilarAssets = (searchTerm) => {
    const lowerSearch = searchTerm.toLowerCase();
    
    // Групуємо активи по назві
    const assetsByName = {};
    
    assets.forEach(asset => {
      if (asset.name && asset.name.toLowerCase().includes(lowerSearch)) {
        const key = asset.name.toLowerCase();
        if (!assetsByName[key]) {
          assetsByName[key] = {
            name: asset.name,
            category: asset.category,
            subCategory: asset.subCategory,
            type: asset.type,
            brand: asset.brand,
            count: 1,
            example: asset,
          };
        } else {
          assetsByName[key].count++;
        }
      }
    });

    // Перетворюємо на масив та сортуємо
    return Object.values(assetsByName)
      .sort((a, b) => {
        // Спочатку точні збіги
        const aExact = a.name.toLowerCase() === lowerSearch;
        const bExact = b.name.toLowerCase() === lowerSearch;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        // Потім по кількості
        return b.count - a.count;
      })
      .slice(0, 10); // Максимум 10 підказок
  };

  const handleSelectAsset = (assetTemplate) => {
    setInputValue(assetTemplate.name);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    
    // Викликаємо onChange для react-hook-form
    if (props.onChange) {
      props.onChange({
        target: {
          name: props.name,
          value: assetTemplate.name,
        },
      });
    }

    // Передаємо дані для заповнення інших полів
    if (onSelectAsset) {
      onSelectAsset(assetTemplate.example);
    }
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelectAsset(suggestions[selectedIndex]);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  return (
    <div className="form-group" ref={wrapperRef}>
      {label && (
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <div className="relative">
          <input
            {...props}
            ref={ref}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (inputValue.trim().length >= 2 && suggestions.length > 0) {
                setShowSuggestions(true);
              }
            }}
            disabled={disabled}
            className={`
              w-full px-3 py-2 pr-10 border rounded-lg
              ${disabled ? 'bg-slate-100 cursor-not-allowed' : ''}
              ${error ? "border-red-500 focus:ring-red-500" : "border-slate-300 focus:ring-indigo-500"}
              focus:outline-none focus:ring-2 transition
            `}
            autoComplete="off"
          />
          <Search 
            size={18} 
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" 
          />
        </div>

        {/* Випадаючий список підказок */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-xl max-h-80 overflow-auto">
            <div className="p-2 bg-slate-50 border-b border-slate-200">
              <p className="text-xs text-slate-600 font-medium">
                Знайдено {suggestions.reduce((sum, s) => sum + s.count, 0)} активів ({suggestions.length} унікальних)
              </p>
            </div>
            
            {suggestions.map((assetTemplate, index) => (
              <div
                key={index}
                onClick={() => handleSelectAsset(assetTemplate)}
                className={`
                  p-3 cursor-pointer transition border-b border-slate-100 last:border-b-0
                  ${selectedIndex === index ? 'bg-indigo-100' : 'hover:bg-slate-50'}
                `}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-slate-900 truncate">
                        {assetTemplate.name}
                      </p>
                      <span className="flex-shrink-0 px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-800 rounded">
                        {assetTemplate.count} шт
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                      {assetTemplate.category && (
                        <span className="flex items-center gap-1">
                          <span className="font-medium">Категорія:</span>
                          {assetTemplate.category}
                        </span>
                      )}
                      {assetTemplate.subCategory && (
                        <span className="flex items-center gap-1">
                          <span className="font-medium">Підкатегорія:</span>
                          {assetTemplate.subCategory}
                        </span>
                      )}
                      {assetTemplate.brand && (
                        <span className="flex items-center gap-1">
                          <span className="font-medium">Бренд:</span>
                          {assetTemplate.brand}
                        </span>
                      )}
                      {assetTemplate.type && (
                        <span className="flex items-center gap-1">
                          <span className="font-medium">Тип:</span>
                          {assetTemplate.type}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <CheckCircle 
                    size={16} 
                    className="flex-shrink-0 text-emerald-600 mt-0.5" 
                  />
                </div>
              </div>
            ))}
            
            <div className="p-2 bg-slate-50 border-t border-slate-200">
              <p className="text-xs text-slate-500 text-center">
                ↑↓ для навігації, Enter для вибору, Esc для закриття
              </p>
            </div>
          </div>
        )}

        {/* Повідомлення коли нічого не знайдено */}
        {showSuggestions && suggestions.length === 0 && inputValue.trim().length >= 2 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-xl p-4">
            <p className="text-sm text-slate-500 text-center">
              Активів з такою назвою не знайдено
            </p>
          </div>
        )}
      </div>

      {error && (
        <span className="text-xs text-red-600 mt-1 block">{error.message}</span>
      )}

      <p className="text-xs text-slate-500 mt-1">
        💡 Почніть вводити назву - система запропонує існуючі варіанти
      </p>
    </div>
  );
});

AssetNameAutocomplete.displayName = "AssetNameAutocomplete";

export default AssetNameAutocomplete;
