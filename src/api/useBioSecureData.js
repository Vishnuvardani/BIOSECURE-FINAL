/**
 * useBioSecureData – fetches all BioSecure collections from MongoDB API
 * and provides role-filtered data to the app.
 */
import { useState, useEffect, useCallback } from "react";
import {
  loginUser,
  getFarms, getFarmsByOwner, getFarmsByDistrict,
  getLivestock, getLivestockByFarm,
  getVaccinations, getVaccinationsByFarm,
  getDiseases, getDiseasesByDistrict,
  getBiosecurity, getBiosecurityByFarm, getBiosecurityByFarmId,
  getVetReports, getVetReportsByFarm,
  getAlerts, getAlertsByDistrict,
  getGISLocations,
  getNotifications, getNotificationsByUser,
  getAnalyticsSummary,
  getUsers,
  getFarmActivity,
  getGovOutbreaks,
} from "./mongoService";

export function useBioSecureData(role, authenticatedUser = null) {
  const [user,          setUser]          = useState(null);
  const [farms,         setFarms]         = useState([]);
  const [livestock,     setLivestock]     = useState([]);
  const [vaccinations,  setVaccinations]  = useState([]);
  const [diseases,      setDiseases]      = useState([]);
  const [biosecurity,   setBiosecurity]   = useState([]);
  const [activities,    setActivities]    = useState([]);
  const [govOutbreaks,  setGovOutbreaks]  = useState([]);
  const [vetReports,    setVetReports]    = useState([]);
  const [alerts,        setAlerts]        = useState([]);
  const [gisLocations,  setGisLocations]  = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [analytics,     setAnalytics]     = useState(null);
  const [allUsers,      setAllUsers]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);

  const safe = (p) => p.catch(() => []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setGovOutbreaks([]);
    try {
      const loggedUser = authenticatedUser || await loginUser(role);
      if (!loggedUser) throw new Error("No user found for role: " + role);
      setUser(loggedUser);

      const { userId, district } = loggedUser;

      if (role === "Farmer") {
        const myFarms = await safe(getFarmsByOwner(userId));
        setFarms(myFarms);

        const [diseasesData, alertsData, gisData, notifsData, analyticsData] =
          await Promise.all([
            safe(getDiseasesByDistrict(district)),
            safe(getAlertsByDistrict(district)),
            safe(getGISLocations()),
            safe(getNotificationsByUser(userId)),
            getAnalyticsSummary().catch(() => null),
          ]);
        setDiseases(diseasesData);
        setAlerts(alertsData);
        setGisLocations(gisData);
        setNotifications(notifsData);
        setAnalytics(analyticsData);

        const farmData = await Promise.all(myFarms.map(async (farm) => {
          const [livestockData, vaccinationData, assessmentData, vetData, activityData] = await Promise.all([
            safe(getLivestockByFarm(farm.farmId)),
            safe(getVaccinationsByFarm(farm.farmId)),
            getBiosecurityByFarmId(farm.farmId).then((record) => record ? [record] : []).catch(() => []),
            safe(getVetReportsByFarm(farm.farmId)),
            safe(getFarmActivity(farm.farmId)),
          ]);
          return { livestockData, vaccinationData, assessmentData, vetData, activityData };
        }));
        setLivestock(farmData.flatMap((farm) => farm.livestockData));
        setVaccinations(farmData.flatMap((farm) => farm.vaccinationData));
        setBiosecurity(farmData.flatMap((farm) => farm.assessmentData).sort((a, b) => new Date(b.assessmentDate || b.createdAt) - new Date(a.assessmentDate || a.createdAt)));
        setVetReports(farmData.flatMap((farm) => farm.vetData));
        setActivities(farmData.flatMap((farm) => farm.activityData).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 15));

      } else if (role === "Veterinarian") {
        const [farmsData, diseasesData, alertsData, gisData, notifsData,
               vetData, vacData, lvData] = await Promise.all([
          safe(getFarms()),
          safe(getDiseases()),
          safe(getAlerts()),
          safe(getGISLocations()),
          safe(getNotificationsByUser(userId)),
          safe(getVetReports()),
          safe(getVaccinations()),
          safe(getLivestock()),
        ]);
        setFarms(farmsData);
        setDiseases(diseasesData);
        setAlerts(alertsData);
        setGisLocations(gisData);
        setNotifications(notifsData);
        setVetReports(vetData);
        setVaccinations(vacData);
        setLivestock(lvData);

      } else {
        // Government Officer / Admin — load everything
        const [farmsData, diseasesData, alertsData, gisData, notifsData,
               analyticsData, usersData, bioData, vacData, vetData, lvData] =
          await Promise.all([
            safe(getFarms()),
            safe(getDiseases()),
            safe(getAlerts()),
            safe(getGISLocations()),
            safe(getNotificationsByUser(userId)),
            getAnalyticsSummary().catch(() => null),
            safe(getUsers()),
            safe(getBiosecurity()),
            safe(getVaccinations()),
            safe(getVetReports()),
            safe(getLivestock()),
          ]);
        setFarms(farmsData);
        setDiseases(diseasesData);
        setAlerts(alertsData);
        setGisLocations(gisData);
        setNotifications(notifsData);
        safe(getGovOutbreaks()).then(setGovOutbreaks);
        setAnalytics(analyticsData);
        setAllUsers(usersData);
        setBiosecurity(bioData);
        setVaccinations(vacData);
        setVetReports(vetData);
        setLivestock(lvData);
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [role, authenticatedUser]);

  useEffect(() => { load(); }, [load]);

  return {
    user, farms, livestock, vaccinations, diseases,
    biosecurity, vetReports, alerts, gisLocations, activities,
    notifications, analytics, allUsers, govOutbreaks,
    loading, error, reload: load,
  };
}
