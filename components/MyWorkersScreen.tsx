import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import Text from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { fetchSavedWorkers, SavedWorkerProfile, saveWorker, setWorkerAvailabilityAlert } from '../api/workers';
import { colors } from '../theme';

type Props = {
  farmerId: string;
  onBack: () => void;
  onBookAgain: (worker: SavedWorkerProfile) => void;
};

function dateLabel(value: string): string {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function MyWorkersScreen({ farmerId, onBack, onBookAgain }: Props) {
  const [freeTodayOnly, setFreeTodayOnly] = useState(false);
  const [workers, setWorkers] = useState<SavedWorkerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingWorkerId, setSavingWorkerId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function loadWorkers() {
    setLoading(true);
    setError('');
    try {
      setWorkers(await fetchSavedWorkers(farmerId, freeTodayOnly));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your saved workers.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkers();
  }, [farmerId, freeTodayOnly]);

  async function toggleAvailabilityAlert(worker: SavedWorkerProfile) {
    setSavingWorkerId(worker.id);
    setError('');
    try {
      if (worker.saved) {
        await setWorkerAvailabilityAlert(farmerId, worker.id, !worker.notifyWhenAvailable);
      } else {
        await saveWorker(farmerId, worker.id, true);
      }
      setWorkers((current) => current.map((item) => item.id === worker.id
        ? { ...item, saved: true, notifyWhenAvailable: !worker.saved || !item.notifyWhenAvailable }
        : item));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not update this alert.');
    } finally {
      setSavingWorkerId(null);
    }
  }

  return <View style={styles.page}>
    <View style={styles.header}>
      <Pressable style={styles.backButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to worker search">
        <Ionicons name="chevron-back" size={23} color={colors.text} />
      </Pressable>
      <Text style={styles.heading}>My workers</Text>
      <Pressable style={styles.refreshButton} onPress={() => { void loadWorkers(); }} disabled={loading} accessibilityRole="button" accessibilityLabel="Refresh saved workers">
        <Ionicons name="refresh-outline" size={21} color={colors.primary} />
      </Pressable>
    </View>

    <View style={styles.filters} accessibilityRole="tablist">
      <Pressable
        style={[styles.filter, !freeTodayOnly && styles.filterSelected]}
        onPress={() => setFreeTodayOnly(false)}
        accessibilityRole="tab"
        accessibilityState={{ selected: !freeTodayOnly }}
      ><Text style={[styles.filterText, !freeTodayOnly && styles.filterTextSelected]}>All</Text></Pressable>
      <Pressable
        style={[styles.filter, freeTodayOnly && styles.filterSelected]}
        onPress={() => setFreeTodayOnly(true)}
        accessibilityRole="tab"
        accessibilityState={{ selected: freeTodayOnly }}
      ><Text style={[styles.filterText, freeTodayOnly && styles.filterTextSelected]}>Free today</Text></Pressable>
    </View>

    <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      {loading ? <View style={styles.empty}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Loading your workers…</Text></View>
        : workers.length === 0 ? <View style={styles.emptyCard}>
          <Ionicons name="people-outline" size={34} color={colors.primary} />
          <Text style={styles.emptyTitle}>{freeTodayOnly ? 'No saved workers are free today' : 'No workers saved yet'}</Text>
          <Text style={styles.muted}>Rate a completed booking and save a worker, or turn on saving after a rating.</Text>
        </View> : workers.map((worker) => <View key={worker.id} style={styles.card}>
          {worker.profileImageUrl
            ? <Image source={{ uri: worker.profileImageUrl }} style={styles.avatarImage} />
            : <View style={styles.avatar}><Text style={styles.avatarText}>{worker.name.charAt(0).toUpperCase() || '?'}</Text></View>}
          <View style={styles.copy}>
            <Text style={styles.workerName}>{worker.name}</Text>
            <View style={styles.metaRow}>
              {!!worker.skills.length && <Text style={styles.badge}>{worker.skills[0].toUpperCase()}</Text>}
              <Text style={styles.meta}>
                {worker.rating === null ? 'No rating' : `★ ${worker.rating.toFixed(1)}`}
                {worker.area ? ` · ${worker.area}` : ''}
              </Text>
            </View>
            <Text style={[styles.availability, worker.available ? styles.available : styles.booked]}>
              {worker.available ? 'Free today' : worker.bookedThrough ? `Booked till ${dateLabel(worker.bookedThrough)}` : 'Not free today'}
            </Text>
            {worker.saved && <View style={styles.alertRow}>
              <Text style={styles.alertLabel}>Notify me when free</Text>
              {savingWorkerId === worker.id ? <ActivityIndicator size="small" color={colors.primary} /> : <Switch
                value={worker.notifyWhenAvailable}
                onValueChange={() => { void toggleAvailabilityAlert(worker); }}
                trackColor={{ false: colors.border, true: colors.primary }}
                accessibilityLabel={`Notify me when ${worker.name} is free`}
              />}
            </View>}
          </View>
          {worker.available
            ? <Pressable style={styles.actionButton} onPress={() => onBookAgain(worker)} accessibilityRole="button" accessibilityLabel={`Book ${worker.name} again`}>
              <Text style={styles.actionText}>Book again</Text>
            </Pressable>
            : !worker.saved && <Pressable style={styles.actionButton} onPress={() => { void toggleAvailabilityAlert(worker); }} accessibilityRole="button">
              <Text style={styles.actionText}>Notify me</Text>
            </Pressable>}
        </View>)}
      <Text style={styles.footerNote}>Saved profiles and alert preferences are stored in your account. Push and SMS delivery is not enabled yet.</Text>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: 'transparent' },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 20 },
  backButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, color: colors.text, fontSize: 23, fontWeight: '800' },
  refreshButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 9 },
  filter: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, borderWidth: 1, borderColor: colors.border, borderRadius: 25 },
  filterSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  filterTextSelected: { color: '#FFFFFF' },
  list: { gap: 15, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30 },
  card: { minHeight: 124, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 26, backgroundColor: colors.surface },
  avatarImage: { width: 56, height: 56, borderRadius: 28 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  avatarText: { color: colors.text, fontSize: 23, fontWeight: '700' },
  copy: { flex: 1, minWidth: 90, gap: 5 },
  workerName: { color: colors.text, fontSize: 19, fontWeight: '800' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  badge: { overflow: 'hidden', color: colors.success, fontSize: 11, fontWeight: '800', backgroundColor: colors.successSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  meta: { color: colors.muted, fontSize: 13 },
  availability: { alignSelf: 'flex-start', overflow: 'hidden', fontSize: 12, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  available: { color: colors.success, backgroundColor: colors.successSoft },
  booked: { color: colors.warning, backgroundColor: colors.warningSoft },
  alertRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
  alertLabel: { color: colors.muted, fontSize: 12, flexShrink: 1 },
  actionButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 24, paddingHorizontal: 13 },
  actionText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 34 },
  emptyCard: { alignItems: 'center', gap: 10, padding: 25, borderWidth: 1, borderColor: colors.border, borderRadius: 24 },
  emptyTitle: { color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 14 },
  footerNote: { color: colors.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: 8, textAlign: 'center' },
});
