import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, MapPin, Car, BatteryCharging, CheckCircle, XCircle, Clock, FileDown, ArrowLeft, Calendar as CalendarIcon, AlertTriangle } from 'lucide-react';

// --- API Configuration ---
const API_BASE_URL = 'https://nx-api.info/api/bi/external';
const API_TOKEN = process.env.REACT_APP_API_TOKEN;

// Mocked data for chargers, as there is no API endpoint for it.
const MOCKED_CHARGERS = [
    { id: "C001", name: "בית אדוויס", location_geo: { lat: 32.16165, lng: 34.93400 }, address: "עתיר ידע 16, כפר סבא" },
    { id: "C002", name: "קניון G", location_geo: { lat: 32.16000, lng: 34.93000 }, address: "התע\"ש 22, כפר סבא" },
    { id: "C003", name: "חניון עירוני", location_geo: { lat: 32.06300, lng: 34.77200 }, address: "דרך מנחם בגין 1, תל אביב" },
];

// Helper function to calculate distance between two lat/lng points in meters
const getDistanceInMeters = (lat1, lon1, lat2, lon2) => {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return Infinity;
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in metres
}

// Main Application Component
export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard'); // 'dashboard' or 'history'
  const [cars, setCars] = useState([]);
  const [chargers, setChargers] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [selectedCharger, setSelectedCharger] = useState(null);
  const [radius, setRadius] = useState(50);
  const [checkResult, setCheckResult] = useState(null); // { status: 'approved'/'denied'/'error', distance: number }
  const [carDetails, setCarDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [apiError, setApiError] = useState(null);

  // Load cars when component mounts
  useEffect(() => {
    if (!API_TOKEN) {
      setApiError('לא נמצא טוקן API. אנא הגדר את REACT_APP_API_TOKEN במשתני הסביבה.');
      return;
    }

    const fetchCars = async () => {
        setIsLoading(true);
        setApiError(null);
        try {
            const listResponse = await fetch(`${API_BASE_URL}/cars/list`, {
                headers: { 'Authorization': API_TOKEN }
            });
            if (!listResponse.ok) {
                if(listResponse.status === 401) throw new Error('טוקן API אינו חוקי או שפג תוקפו.');
                throw new Error(`שגיאת רשת בטעינת רשימת הרכבים! סטטוס: ${listResponse.status}`);
            }
            const listData = await listResponse.json();

            if (listData.success && Array.isArray(listData.data)) {
                const carNumbers = listData.data;
                if (carNumbers.length === 0) {
                    setCars([]);
                    return;
                }
                
                const infoResponse = await fetch(`${API_BASE_URL}/cars/info`, {
                    method: 'POST',
                    headers: { 'Authorization': API_TOKEN, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ car_numbers: carNumbers })
                });
                if (!infoResponse.ok) throw new Error(`שגיאת רשת בטעינת פרטי הרכבים! סטטוס: ${infoResponse.status}`);
                const infoData = await infoResponse.json();

                if (infoData.success) {
                    setCars(infoData.data);
                } else {
                    throw new Error('ה-API החזיר שגיאה בטעינת פרטי הרכבים.');
                }
            } else {
                throw new Error('פורמט נתונים לא תקין מרשימת הרכבים.');
            }
        } catch (error) {
            console.error('Error fetching car list:', error);
            setApiError(error.message || 'שגיאה בטעינת רשימת הרכבים. אנא נסה שוב מאוחר יותר.');
        } finally {
            setIsLoading(false);
        }
    };
    
    fetchCars();
    setChargers(MOCKED_CHARGERS);
  }, []);
  
  // Handlers
  const handleCarSelect = (carNumber) => {
    const car = cars.find(c => c.car_number === carNumber);
    setSelectedCar(car);
    setCarDetails(null); 
    setCheckResult(null); 
  };

  const handleChargerSelect = (chargerId) => {
    const charger = chargers.find(c => c.id === chargerId);
    setSelectedCharger(charger);
    setCheckResult(null); 
  };

  const handleCheck = async () => {
    if (!selectedCar || !selectedCharger) {
        console.warn("Please select a car and a charger.");
        return;
    }
    setIsChecking(true);
    setCheckResult(null);
    setApiError(null);

    try {
        const response = await fetch(`${API_BASE_URL}/cars/info`, {
            method: 'POST',
            headers: { 'Authorization': API_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ car_numbers: [selectedCar.car_number] })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        if (data.success && data.data.length > 0) {
            const carInfo = data.data[0];
            setCarDetails(carInfo);

            if (carInfo.lat != null && carInfo.lng != null && selectedCharger.location_geo) {
                const distance = getDistanceInMeters(carInfo.lat, carInfo.lng, selectedCharger.location_geo.lat, selectedCharger.location_geo.lng);
                const result = { status: distance <= radius ? 'approved' : 'denied', distance: Math.round(distance) };
                setCheckResult(result);
            } else {
                setCheckResult({ status: 'error', message: 'לא התקבל מיקום עבור הרכב או המטען.' });
            }
        } else {
             throw new Error('API returned success: false or no data for the selected car.');
        }
    } catch (error) {
        console.error('Error fetching car info:', error);
        setCheckResult({ status: 'error', message: 'לא ניתן היה לקבל את מיקום הרכב.' });
    } finally {
        setIsChecking(false);
    }
  };

  const navigateToHistory = () => {
      if(selectedCar) {
          setCurrentPage('history');
      } else {
          console.warn("Please select a car to view its history.");
      }
  };

  const navigateToDashboard = () => {
      setCurrentPage('dashboard');
      setCheckResult(null);
      setCarDetails(null);
  };
  
  // Render logic
  return (
    <div className="bg-gray-50 min-h-screen font-sans text-gray-800" dir="rtl">
      <Header />
      <main className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
        {isLoading ? (
            <div className="text-center py-10">
                <p className="text-gray-500">טוען נתונים...</p>
            </div>
        ) : (
            <>
                {apiError && !isLoading && <ApiError message={apiError} />}
                {currentPage === 'dashboard' && (
                  <Dashboard
                    cars={cars}
                    chargers={chargers}
                    selectedCar={selectedCar}
                    selectedCharger={selectedCharger}
                    radius={radius}
                    checkResult={checkResult}
                    carDetails={carDetails}
                    isChecking={isChecking}
                    onCarSelect={handleCarSelect}
                    onChargerSelect={handleChargerSelect}
                    onRadiusChange={setRadius}
                    onCheck={handleCheck}
                    onNavigateToHistory={navigateToHistory}
                  />
                )}
                {currentPage === 'history' && selectedCar && (
                  <HistoryScreen
                    car={selectedCar}
                    onBack={navigateToDashboard}
                    radius={radius}
                  />
                )}
            </>
        )}
      </main>
    </div>
  );
}

// Header Component
const Header = () => (
  <header className="bg-white shadow-sm">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
      <div className="flex items-center space-x-4 space-x-reverse">
        <div className="bg-blue-500 text-white font-bold text-2xl rounded-md p-2">A</div>
        <h1 className="text-2xl font-bold text-gray-800">ADVICE</h1>
      </div>
      <p className="text-sm text-gray-500 hidden sm:block">ניהול טעינת צי רכב חשמלי</p>
    </div>
  </header>
);

// Dashboard Component
const Dashboard = ({ cars, chargers, selectedCar, selectedCharger, radius, checkResult, carDetails, isChecking, onCarSelect, onChargerSelect, onRadiusChange, onCheck, onNavigateToHistory }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-md space-y-6">
        <h2 className="text-xl font-semibold text-gray-700 border-b pb-3">סימולטור דלקן חכם</h2>
        <div className="space-y-4">
          <CustomSelect 
            label="בחר רכב" 
            icon={<Car className="w-5 h-5 text-gray-400"/>} 
            options={cars.map(c => ({ value: c.car_number, label: `${c.brand || ''} ${c.model || 'רכב'} (${c.car_number})` }))}
            value={selectedCar?.car_number}
            onChange={(e) => onCarSelect(e.target.value)}
            placeholder={cars.length === 0 ? "לא נמצאו רכבים" : "בחר מרשימת הרכבים"}
            disabled={cars.length === 0}
          />
          <CustomSelect 
            label="בחר עמדת טעינה" 
            icon={<BatteryCharging className="w-5 h-5 text-gray-400"/>}
            options={chargers.map(ch => ({ value: ch.id, label: `${ch.name} - ${ch.address}` }))}
            value={selectedCharger?.id}
            onChange={(e) => onChargerSelect(e.target.value)}
            placeholder="בחר מרשימת העמדות"
          />
        </div>
        <div>
          <label htmlFor="radius" className="block text-sm font-medium text-gray-600 mb-2">רדיוס אימות (מטרים): <span className="font-bold text-blue-600">{radius} מ'</span></label>
          <input type="range" id="radius" min="10" max="8000" step="50" value={radius} onChange={(e) => onRadiusChange(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
        </div>
        <div className="space-y-3 pt-4 border-t">
          <button onClick={onCheck} disabled={!selectedCar || !selectedCharger || isChecking} className="w-full flex justify-center items-center bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-300">
            {isChecking ? <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : "ודא סמיכות רכב למטען"}
          </button>
          <button onClick={onNavigateToHistory} disabled={!selectedCar} className="w-full flex justify-center items-center bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors duration-300">
            <Clock className="w-5 h-5 ml-2" /> היסטוריית טעינות
          </button>
        </div>
      </div>
      <div className="lg:col-span-2 space-y-8">
        {checkResult && <ResultCard result={checkResult} />}
        <div className="bg-white p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">מפת מיקומים</h2>
          <MapDisplay carDetails={carDetails} charger={selectedCharger} radius={radius} />
        </div>
      </div>
    </div>
  );
};

// Custom Select Component
const CustomSelect = ({ label, icon, options, value, onChange, placeholder, disabled }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>
    <div className="relative">
      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
        {icon}
      </div>
      <select 
        value={value || ''}
        onChange={onChange}
        disabled={disabled}
        className="w-full block appearance-none bg-white border border-gray-300 text-gray-700 py-2 pl-3 pr-10 rounded-md leading-tight focus:outline-none focus:bg-white focus:border-blue-500 disabled:bg-gray-100"
      >
        <option value="" disabled>{placeholder}</option>
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-2 text-gray-700">
        <ChevronDown className="w-5 h-5" />
      </div>
    </div>
  </div>
);

// Result Card Component
const ResultCard = ({ result }) => {
  const isApproved = result.status === 'approved';
  const isDenied = result.status === 'denied';
  const isError = result.status === 'error';

  const bgColor = isApproved ? 'bg-green-50 border-green-200' : isDenied ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200';
  const iconColor = isApproved ? 'text-green-500' : isDenied ? 'text-red-500' : 'text-yellow-500';
  const titleColor = isApproved ? 'text-green-800' : isDenied ? 'text-red-800' : 'text-yellow-800';
  const textColor = isApproved ? 'text-green-600' : isDenied ? 'text-red-600' : 'text-yellow-600';

  const title = isApproved ? 'סמיכות רכב אושרה' : isDenied ? 'סמיכות רכב נדחתה' : 'שגיאה בבדיקה';
  let message = '';
  if (isApproved) message = `הרכב נמצא בטווח המותר (${result.distance} מ' מהמטען).`;
  if (isDenied) message = `הרכב מחוץ לטווח (${result.distance} מ' מהמטען).`;
  if (isError) message = result.message || 'אירעה שגיאה לא צפויה.';

  return (
    <div className={`p-6 rounded-xl shadow-lg ${bgColor} border`}>
      <div className="flex items-center">
        {isApproved && <CheckCircle className={`w-12 h-12 ${iconColor}`} />}
        {isDenied && <XCircle className={`w-12 h-12 ${iconColor}`} />}
        {isError && <AlertTriangle className={`w-12 h-12 ${iconColor}`} />}
        <div className="mr-4">
          <h3 className={`text-2xl font-bold ${titleColor}`}>{title}</h3>
          <p className={`mt-1 ${textColor}`}>{message}</p>
        </div>
      </div>
    </div>
  );
};

// Map Display Component - Reverted to original simulation
const MapDisplay = ({ carDetails, charger, radius }) => {
    const mapContainerStyle = {
        width: '100%',
        height: '400px',
        borderRadius: '0.75rem',
        backgroundColor: '#e9ecef',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
    };
    const hasData = carDetails && charger;
    return (
        <div style={mapContainerStyle}>
            {!hasData && <p className="text-gray-500">בחר רכב ומטען ולחץ "ודא סמיכות" להצגת מיקומים.</p>}
            {hasData && (
                <div className="w-full h-full relative p-4 text-right">
                    <p className="absolute top-2 right-2 text-xs bg-white/70 p-1 rounded">תצוגת מפה (סימולציה)</p>
                    <div className="absolute" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                        <MapPin className="w-8 h-8 text-orange-500" />
                        <span className="text-xs bg-white px-1 rounded -translate-y-6 -translate-x-4 absolute">מטען</span>
                    </div>
                    <div className="absolute" style={{ top: '40%', left: '60%', transform: 'translate(-50%, -50%)' }}>
                        <Car className="w-8 h-8 text-blue-600" />
                        <span className="text-xs bg-white px-1 rounded -translate-y-6 -translate-x-2 absolute">רכב</span>
                    </div>
                    <div className="absolute border-2 border-dashed border-green-500 rounded-full" style={{ top: '50%', left: '50%', width: `${radius/2}px`, height: `${radius/2}px`, transform: 'translate(-50%, -50%)' }}></div>
                    <div className="absolute bottom-2 right-2 text-xs bg-white/70 p-1 rounded">
                        <p><strong>מיקום רכב:</strong> {carDetails.lat}, {carDetails.lng}</p>
                        <p><strong>מיקום מטען:</strong> {charger.address}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

// History Screen Component
const HistoryScreen = ({ car, onBack, radius }) => {
  const [chargingHistory, setChargingHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState(null);
  const [dateRange, setDateRange] = useState({
      from: new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0],
      to: new Date().toISOString().split('T')[0]
  });

  const formatDateForApi = (dateString) => {
      if (!dateString) return null;
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
  };

  useEffect(() => {
    if (!car || !API_TOKEN) return;

    const fetchHistory = async () => {
        setIsLoading(true);
        setApiError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/reports/cars/charging`, {
                method: 'POST',
                headers: { 'Authorization': API_TOKEN, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    car_numbers: [car.car_number],
                    date_from: formatDateForApi(dateRange.from),
                    date_to: formatDateForApi(dateRange.to)
                })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (data.success) {
                setChargingHistory(data.data[0] || []);
            } else {
                throw new Error('API returned success: false when fetching history.');
            }
        } catch (error) {
            console.error('Error fetching charging history:', error);
            setApiError('שגיאה בטעינת היסטוריית הטעינות.');
        } finally {
            setIsLoading(false);
        }
    };
    
    fetchHistory();
  }, [car, dateRange]);
  
  const exportToExcel = () => {
    const headers = ["תאריך התחלה", "תאריך סיום", "משך", "אחוז התחלה", "אחוז סיום", "סה\"כ קוט\"ש", "עלות", "מיקום", "מרחק מהעמדה (מ')"];
    const data = chargingHistory.map(item => `"${[item.datetime_start, item.datetime_end, item.duration, item.percents_start, item.percents_end, item.total_kw, item.total_price, item.location_name, item.distance].join('","')}"`);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(','), ...data].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `charging_history_${car.car_number}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-md">
      <div className="flex justify-between items-center border-b pb-4 mb-6">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">היסטוריית טעינות</h2>
            <p className="text-gray-500">{`רכב: ${car.brand || ''} ${car.model || ''} (${car.car_number})`}</p>
        </div>
        <button onClick={onBack} className="flex items-center bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors">
          <ArrowLeft className="w-5 h-5 ml-2" />
          חזרה לדשבורד
        </button>
      </div>
      
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-4 flex-wrap">
          <CalendarIcon className="w-5 h-5 text-gray-500"/>
          <input type="date" value={dateRange.from} onChange={e => setDateRange({...dateRange, from: e.target.value})} className="border-gray-300 rounded-md p-2"/>
          <span className="text-gray-500">-</span>
          <input type="date" value={dateRange.to} onChange={e => setDateRange({...dateRange, to: e.target.value})} className="border-gray-300 rounded-md p-2"/>
        </div>
        <button onClick={exportToExcel} disabled={chargingHistory.length === 0} className="flex items-center bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400">
          <FileDown className="w-5 h-5 ml-2" />
          ייצוא ל-Excel
        </button>
      </div>

      <div className="overflow-x-auto">
        {isLoading && <p className="text-center py-8 text-gray-500">טוען היסטוריה...</p>}
        {apiError && !isLoading && <ApiError message={apiError} />}
        {!isLoading && !apiError && chargingHistory.length === 0 && (
          <p className="text-center py-8 text-gray-500">לא נמצאו רשומות טעינה עבור הרכב והתאריכים שנבחרו.</p>
        )}
        {!isLoading && !apiError && chargingHistory.length > 0 && (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                {["תאריך התחלה", "משך", "סוללה", "אנרגיה (קוט\"ש)", "עלות", "מיקום", "מרחק (מ')"].map(header => (
                  <th key={header} scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {chargingHistory.map((item, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.datetime_start}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.duration}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      {item.percents_start}% → {item.percents_end}% 
                      <span className="mr-2 text-green-600 font-semibold">(+{item.total_percents}%)</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{Number(item.total_kw).toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">₪{Number(item.total_price).toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.location_name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${Number(item.distance) > radius ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                        {item.distance}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const ApiError = ({ message }) => (
    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-md" role="alert">
        <p className="font-bold">שגיאת API</p>
        <p>{message}</p>
    </div>
);
