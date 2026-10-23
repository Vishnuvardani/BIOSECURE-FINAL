import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, FlatList } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useDrawerStatus } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { analyticsAPI, notificationAPI, farmAPI } from '../../services/api';
import { Card, StatCard, RiskBadge, Loader } from '../../components/UIComponents';
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '../../theme';

const QUICK_ACTIONS = [
  { label: 'Add Farm', icon: 'add-circle', color: Colors.primary, screen: 'AddFarm' },
  { label: 'Add Animal', icon: 'paw', color: Colors.secondary, screen: 'AddLivestock' },
  { label: 'Vaccinate', icon: 'medical', color: Colors.info, screen: 'Vaccination' },
  { label: 'Biosecurity', icon: 'shield-checkmark', color: Colors.warning, screen: 'Biosecurity' },
  { label: 'AI Predict', icon: 'flask', color: '#6f42c1', screen: 'DiseasePrediction' },
  { label: 'GIS Map', icon: 'map', color: '#fd7e14', screen: 'Map' }
];

export default function FarmerDashboard() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weather, setWeather] = useState(null);
  const [farmCity, setFarmCity] = useState(null);

  const fetchWeather = useCallback(async (city) => {
    try {
      const key = '3ce7a4e03e0e642f1467780e357d7da5';
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${key}&units=metric`);
      const data = await res.json();
      if (data.cod === 200) setWeather(data);
    } catch { }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, notifRes, farmsRes] = await Promise.all([
        analyticsAPI.dashboard(),
        notificationAPI.getAll(),
        farmAPI.getAll()
      ]);
      setStats(statsRes.data);
      setNotifications(notifRes.data?.slice(0, 5) || []);
      const farm = farmsRes.data?.[0];
      const city = farm?.address?.city || null;
      const district = farm?.address?.district || null;
      setFarmCity(district || city);
      if (city) fetchWeather(city);
    } catch { }
    setLoading(false);
    setRefreshing(false);
  }, [fetchWeather]);

  useEffect(() => { fetchData(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) return <Loader message="Loading dashboard..." />;

  const statCards = [
    { title: 'Total Farms', value: stats?.totalFarms || 0, icon: 'business', color: Colors.primary },
    { title: 'Total Animals', value: stats?.totalAnimals || 0, icon: 'paw', color: Colors.secondary },
    { title: 'Vaccinations', value: stats?.vaccinationsCompleted || 0, icon: 'medical', color: Colors.info },
    { title: 'Disease Alerts', value: stats?.diseaseAlerts || 0, icon: 'warning', color: Colors.danger },
    { title: 'Bio Score', value: stats?.biosecurityScore || 0, icon: 'shield-checkmark', color: '#6f42c1' },
    { title: 'Due Vaccines', value: stats?.upcomingVaccinations || 0, icon: 'calendar', color: Colors.warning }
  ];

  const bioScore = stats?.biosecurityScore || 0;
  const riskLevel = bioScore >= 81 ? 'low' : bioScore >= 51 ? 'moderate' : 'high';

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.openDrawer()}>
            <Ionicons name="menu" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.greeting}>Good Morning 👋</Text>
            <Text style={styles.userName}>{user?.fullName}</Text>
            {farmCity && <Text style={styles.headerCity}>📍 {farmCity}</Text>}
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.biosecurityBanner}>
          <View>
            <Text style={styles.bannerLabel}>Biosecurity Score</Text>
            <Text style={styles.bannerScore}>{bioScore}/100</Text>
          </View>
          <RiskBadge level={riskLevel} />
          <View style={styles.scoreBar}>
            <View style={[styles.scoreBarFill, { width: `${bioScore}%`, backgroundColor: riskLevel === 'low' ? Colors.secondary : riskLevel === 'moderate' ? Colors.warning : Colors.danger }]} />
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false}>
        {/* Stats Grid */}
        <Text style={styles.sectionTitle}>Farm Overview</Text>
        <View style={styles.statsGrid}>
          {statCards.map((s, i) => (
            <StatCard key={i} title={s.title} value={s.value} icon={s.icon} color={s.color} />
          ))}
        </View>

        {/* Weather Card */}
        {weather && (
          <Card style={styles.weatherCard}>
            <View style={styles.weatherRow}>
              <View>
                <Text style={styles.weatherCity}>{farmCity || '—'}</Text>
                <Text style={styles.weatherTemp}>{Math.round(weather.main.temp)}°C</Text>
                <Text style={styles.weatherDesc}>{weather.weather[0].description}</Text>
                <Text style={styles.weatherMeta}>💧 {weather.main.humidity}%  💨 {weather.wind.speed} m/s</Text>
              </View>
              <Ionicons name="partly-sunny" size={52} color={Colors.warning} />
            </View>
          </Card>
        )}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((a) => (
            <TouchableOpacity key={a.label} style={styles.actionCard} onPress={() => navigation.navigate(a.screen)}>
              <View style={[styles.actionIcon, { backgroundColor: a.color + '20' }]}>
                <Ionicons name={a.icon} size={28} color={a.color} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Activities */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activities</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Notifications')}>
            <Text style={styles.seeAll}>See All</Text>
          </TouchableOpacity>
        </View>
        {notifications.length > 0 ? notifications.map((n) => (
          <Card key={n._id} style={styles.notifCard}>
            <View style={styles.notifRow}>
              <View style={[styles.notifDot, { backgroundColor: n.type === 'alert' ? Colors.danger : Colors.primary }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.notifTitle}>{n.title}</Text>
                <Text style={styles.notifMsg} numberOfLines={2}>{n.message}</Text>
                {n.createdAt && <Text style={styles.notifTime}>{new Date(n.createdAt).toLocaleDateString()}</Text>}
              </View>
            </View>
          </Card>
        )) : (
          <Card style={styles.notifCard}>
            <Text style={styles.notifMsg}>No recent activities</Text>
          </Card>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: 50, paddingBottom: Spacing.lg, paddingHorizontal: Spacing.md },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  headerCenter: { flex: 1, marginHorizontal: Spacing.md },
  greeting: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm },
  userName: { color: '#fff', fontSize: FontSize.lg, fontWeight: '800' },
  headerCity: { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.xs, marginTop: 2 },
  biosecurityBanner: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: BorderRadius.md, padding: Spacing.md },
  bannerLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.xs },
  bannerScore: { color: '#fff', fontSize: FontSize.xxl, fontWeight: '900' },
  scoreBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3, marginTop: Spacing.xs, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 3 },
  content: { flex: 1, padding: Spacing.md },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: Spacing.sm, marginTop: Spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seeAll: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actionCard: { width: '30%', alignItems: 'center', backgroundColor: '#fff', borderRadius: BorderRadius.md, padding: Spacing.md, ...Shadow.sm },
  actionIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
  actionLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text, textAlign: 'center' },
  notifCard: { marginBottom: Spacing.xs },
  notifRow: { flexDirection: 'row', alignItems: 'flex-start' },
  notifDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, marginRight: Spacing.sm },
  notifTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  notifMsg: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  notifTime: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  weatherCard: { marginBottom: Spacing.sm },
  weatherRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weatherCity: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  weatherTemp: { fontSize: FontSize.xxl, fontWeight: '900', color: Colors.primary },
  weatherDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textTransform: 'capitalize' },
  weatherMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 }
});
