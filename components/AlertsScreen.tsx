import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Text from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { FarmerAlert, fetchFarmerAlerts } from '../api/workers';
import { BookingBucket } from '../api/requests';
import { colors } from '../theme';

type Props = {
  farmerId: string;
  onFindWorkers: (alert?: FarmerAlert) => void;
  onOpenBookings: (bucket?: BookingBucket) => void;
  onOpenProfile: () => void;
};

function timeAgo(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

function alertIcon(type: FarmerAlert['type']): keyof typeof Ionicons.glyphMap {
  if (type === 'accepted') return 'checkmark';
  if (type === 'availability') return 'notifications-outline';
  if (type === 'expired') return 'time-outline';
  if (type === 'cancelled') return 'close';
  return 'checkmark-done-outline';
}

function alertTone(type: FarmerAlert['type']): { background: string; foreground: string } {
  if (type === 'accepted' || type === 'completed') return { background: colors.successSoft, foreground: colors.success };
  if (type === 'availability') return { background: colors.primarySoft, foreground: colors.primary };
  return { background: colors.warningSoft, foreground: colors.warning };
}

export default function AlertsScreen({ farmerId, onFindWorkers, onOpenBookings, onOpenProfile }: Props) {
  const [alerts, setAlerts] = useState<FarmerAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadAlerts() {
    setLoading(true);
    setError('');
    try {
      setAlerts(await fetchFarmerAlerts(farmerId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load alerts.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAlerts();
  }, [farmerId]);

  function openAlert(alert: FarmerAlert) {
    if (alert.type === 'availability') onFindWorkers(alert);
    else if (alert.type === 'expired') onFindWorkers();
    else onOpenBookings(alert.type === 'accepted' ? 'upcoming' : 'past');
  }

  return <View style={styles.page}>
    <View style={styles.header}>
      <View><Text style={styles.heading}>Alerts</Text><Text style={styles.subtitle}>ముఖ్యమైన సమాచారం</Text></View>
      <Pressable style={styles.refreshButton} onPress={() => { void loadAlerts(); }} disabled={loading} accessibilityRole="button" accessibilityLabel="Refresh alerts">
        <Ionicons name="refresh-outline" size={21} color={colors.primary} />
      </Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      {loading ? <View style={styles.empty}><ActivityIndicator color={colors.primary} /><Text style={styles.emptyText}>Loading updates…</Text></View>
        : alerts.length === 0 ? <View style={styles.emptyCard}>
          <Ionicons name="notifications-outline" size={36} color={colors.primary} />
          <Text style={styles.emptyTitle}>No updates yet</Text>
          <Text style={styles.emptyText}>Worker replies, completed jobs, and matching search alerts will appear here.</Text>
        </View> : alerts.map((alert) => {
          const tone = alertTone(alert.type);
          const actionLabel = alert.type === 'availability' ? 'View workers'
            : alert.type === 'expired' ? 'Find another'
              : alert.type === 'accepted' ? 'View booking' : 'View details';
          return <View key={alert.id} style={styles.card}>
            <View style={[styles.icon, { backgroundColor: tone.background }]}>
              <Ionicons name={alertIcon(alert.type)} size={23} color={tone.foreground} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>{alert.title}</Text>
              <Text style={styles.message}>{alert.message}</Text>
              <Pressable style={styles.action} onPress={() => openAlert(alert)} accessibilityRole="button">
                <Text style={styles.actionText}>{actionLabel}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.primary} />
              </Pressable>
              <Text style={styles.time}>{timeAgo(alert.createdAt)}</Text>
            </View>
          </View>;
        })}
    </ScrollView>
    <View style={styles.bottomBar} accessibilityRole="tablist">
      <Pressable style={styles.bottomTab} onPress={() => onFindWorkers()} accessibilityRole="tab">
        <Ionicons name="search-outline" size={22} color={colors.muted} /><Text style={styles.tabText}>Find</Text>
      </Pressable>
      <Pressable style={styles.bottomTab} onPress={() => onOpenBookings()} accessibilityRole="tab">
        <Ionicons name="reader-outline" size={22} color={colors.muted} /><Text style={styles.tabText}>Bookings</Text>
      </Pressable>
      <View style={styles.bottomTab} accessibilityRole="tab" accessibilityState={{ selected: true }}>
        <Ionicons name="notifications-outline" size={22} color={colors.primary} /><Text style={[styles.tabText, styles.tabSelected]}>Alerts</Text>
      </View>
      <Pressable style={styles.bottomTab} onPress={onOpenProfile} accessibilityRole="tab">
        <Ionicons name="person-outline" size={22} color={colors.muted} /><Text style={styles.tabText}>Profile</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: 'transparent' },
  header: { minHeight: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  heading: { color: colors.primary, fontSize: 30, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 2 },
  refreshButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surfaceMuted },
  list: { flexGrow: 1, gap: 14, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  card: { minHeight: 132, flexDirection: 'row', alignItems: 'flex-start', gap: 13, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 25, backgroundColor: colors.surface },
  icon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 25 },
  copy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  message: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  action: { alignSelf: 'flex-start', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 22 },
  actionText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  time: { color: colors.muted, fontSize: 13, marginTop: 3 },
  bottomBar: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  bottomTab: { minWidth: 68, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 8 },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  tabSelected: { color: colors.primary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyCard: { alignItems: 'center', gap: 9, padding: 25, borderWidth: 1, borderColor: colors.border, borderRadius: 24 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 14 },
});
