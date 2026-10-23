import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { analyticsAPI } from '../../services/api';
import { Header, Card, Loader } from '../../components/UIComponents';
import { Colors, Spacing, FontSize, BorderRadius } from '../../theme';

const { width } = Dimensions.get('window');

const TABS = ['Charts', 'District'];

export default function AnalyticsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('Charts');
  const [diseaseData, setDiseaseData] = useState(null);
  const [vaccData, setVaccData] = useState(null);
  const [bioData, setBioData] = useState(null);
  const [districtData, setDistrictData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      analyticsAPI.disease(),
      analyticsAPI.vaccination(),
      analyticsAPI.biosecurity(),
      analyticsAPI.district()
    ]).then(([d, v, b, dist]) => {
      setDiseaseData(d.data);
      setVaccData(v.data);
      setBioData(b.data);
      setDistrictData(dist.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const BarChart = ({ data, title, colorKey }) => {
    if (!data?.length) return null;
    const max = Math.max(...data.map(d => d.count || d.avgScore || 1));
    return (
      <Card style={styles.chartCard}>
        <Text style={styles.chartTitle}>{title}</Text>
        {data.map((item, i) => (
          <View key={i} style={styles.barRow}>
            <Text style={styles.barLabel}>{item._id || 'Unknown'}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${((item.count || item.avgScore || 0) / max) * 100}%`, backgroundColor: colorKey[i % colorKey.length] }]} />
            </View>
            <Text style={styles.barValue}>{item.count || Math.round(item.avgScore) || 0}</Text>
          </View>
        ))}
      </Card>
    );
  };

  if (loading) return <Loader message="Loading analytics..." />;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Header title="Analytics" subtitle="Farm & Disease Statistics" onBack={() => navigation?.goBack()} />

      <View style={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'Charts' && (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Summary Cards */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{diseaseData?.total || 0}</Text>
              <Text style={styles.summaryLabel}>Total Diseases</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: Colors.secondaryLight }]}>
              <Text style={[styles.summaryValue, { color: Colors.secondary }]}>{vaccData?.completed || 0}</Text>
              <Text style={styles.summaryLabel}>Vaccinations Done</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#f3e8ff' }]}>
              <Text style={[styles.summaryValue, { color: '#6f42c1' }]}>{Math.round(bioData?.stats?.avg || 0)}</Text>
              <Text style={styles.summaryLabel}>Avg Bio Score</Text>
            </View>
          </View>

          <BarChart data={diseaseData?.byType} title="Disease by Type" colorKey={[Colors.danger, Colors.warning, Colors.info, Colors.primary, Colors.secondary]} />
          <BarChart data={diseaseData?.bySeverity} title="Disease Severity" colorKey={[Colors.secondary, Colors.warning, Colors.danger, '#6f0000']} />
          <BarChart data={vaccData?.byStatus} title="Vaccination Status" colorKey={[Colors.secondary, Colors.primary, Colors.danger]} />
          <BarChart data={bioData?.byRisk} title="Biosecurity Risk Levels" colorKey={[Colors.secondary, Colors.warning, Colors.danger]} />

          {/* Vaccination Rate */}
          <Card style={styles.chartCard}>
            <Text style={styles.chartTitle}>Vaccination Completion Rate</Text>
            <View style={styles.rateContainer}>
              <Text style={styles.rateValue}>{vaccData?.completionRate || 0}%</Text>
              <View style={styles.rateBar}>
                <View style={[styles.rateBarFill, { width: `${vaccData?.completionRate || 0}%` }]} />
              </View>
            </View>
          </Card>
        </ScrollView>
      )}

      {activeTab === 'District' && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>District-wise Farm Distribution</Text>
          {districtData.map((d, i) => (
            <Card key={i} style={styles.districtCard}>
              <View style={styles.districtRow}>
                <View style={styles.districtRank}>
                  <Text style={styles.rankText}>#{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.districtName}>{d._id || 'Unknown District'}</Text>
                  <Text style={styles.districtFarms}>{d.count} farms</Text>
                </View>
                <View style={styles.districtScore}>
                  <Text style={styles.scoreText}>{Math.round(d.avgBioScore || 0)}</Text>
                  <Text style={styles.scoreLabel}>Avg Score</Text>
                </View>
              </View>
              <View style={styles.districtBar}>
                <View style={[styles.districtBarFill, { width: `${Math.min((d.count / (districtData[0]?.count || 1)) * 100, 100)}%` }]} />
              </View>
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 3, borderBottomColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary },
  content: { padding: Spacing.md, paddingBottom: 80 },
  summaryRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  summaryCard: { flex: 1, backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center' },
  summaryValue: { fontSize: FontSize.xxl, fontWeight: '900', color: Colors.primary },
  summaryLabel: { fontSize: 10, color: Colors.textSecondary, textAlign: 'center', marginTop: 2 },
  chartCard: { marginBottom: Spacing.md },
  chartTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginBottom: Spacing.sm },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs },
  barLabel: { width: 100, fontSize: FontSize.xs, color: Colors.textSecondary },
  barTrack: { flex: 1, height: 12, backgroundColor: Colors.border, borderRadius: 6, overflow: 'hidden', marginHorizontal: Spacing.xs },
  barFill: { height: '100%', borderRadius: 6 },
  barValue: { width: 30, fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  rateContainer: { alignItems: 'center' },
  rateValue: { fontSize: 48, fontWeight: '900', color: Colors.secondary },
  rateBar: { width: '100%', height: 12, backgroundColor: Colors.border, borderRadius: 6, overflow: 'hidden', marginTop: Spacing.sm },
  rateBarFill: { height: '100%', backgroundColor: Colors.secondary, borderRadius: 6 },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: Spacing.md },
  districtCard: { marginBottom: Spacing.xs },
  districtRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs },
  districtRank: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm },
  rankText: { fontSize: FontSize.xs, fontWeight: '800', color: Colors.primary },
  districtName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  districtFarms: { fontSize: FontSize.xs, color: Colors.textSecondary },
  districtScore: { alignItems: 'center' },
  scoreText: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.primary },
  scoreLabel: { fontSize: 10, color: Colors.textSecondary },
  districtBar: { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  districtBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 }
});
