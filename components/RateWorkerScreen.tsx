import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import Text from './AppText';
import { Ionicons } from '@expo/vector-icons';
import {
  submitWorkerReview,
  WorkerAttendanceStatus,
  WorkerReviewInput,
  WorkerReviewTag,
} from '../api/workers';
import { colors } from '../theme';

type Props = {
  requestId: string;
  workerId: string;
  farmerId: string;
  workerName: string;
  workerImageUrl: string | null;
  requestTitle: string;
  startDate: string;
  endDate: string;
  peopleNeeded: number;
  onBack: () => void;
  onSubmitted: () => void;
};

const reviewTags: Array<{ value: WorkerReviewTag; label: string }> = [
  { value: 'on_time', label: 'On time' },
  { value: 'hard_working', label: 'Hard working' },
  { value: 'careful', label: 'Careful' },
  { value: 'good_with_tools', label: 'Good with tools' },
];

const attendanceOptions: Array<{ value: WorkerAttendanceStatus; label: string }> = [
  { value: 'fewer_attended', label: 'Fewer people came' },
  { value: 'nobody_showed', label: 'Nobody showed up' },
  { value: 'came_late', label: 'Came late' },
  { value: 'everything_fine', label: 'Everything was fine' },
];

function formatDate(value: string): string {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

export default function RateWorkerScreen({
  requestId,
  workerId,
  farmerId,
  workerName,
  workerImageUrl,
  requestTitle,
  startDate,
  endDate,
  peopleNeeded,
  onBack,
  onSubmitted,
}: Props) {
  const [rating, setRating] = useState(0);
  const [attendanceStatus, setAttendanceStatus] = useState<WorkerAttendanceStatus>('all_attended');
  const [peopleAttended, setPeopleAttended] = useState(peopleNeeded);
  const [tags, setTags] = useState<WorkerReviewTag[]>([]);
  const [saveWorker, setSaveWorker] = useState(true);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function chooseAttendance(value: WorkerAttendanceStatus) {
    setAttendanceStatus(value);
    if (value === 'nobody_showed') setPeopleAttended(0);
    else if (value === 'fewer_attended') setPeopleAttended(Math.max(1, peopleNeeded - 1));
    else setPeopleAttended(peopleNeeded);
    setFollowUpOpen(false);
  }

  function toggleTag(value: WorkerReviewTag) {
    setTags((current) => current.includes(value)
      ? current.filter((tag) => tag !== value)
      : [...current, value]);
  }

  async function submit() {
    if (!rating) {
      setError('Choose a star rating before submitting.');
      return;
    }
    if (attendanceStatus === 'fewer_attended'
      && (peopleAttended < 1 || peopleAttended >= peopleNeeded)) {
      setError('Set how many people attended.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const input: WorkerReviewInput = {
        requestId,
        workerId,
        farmerId,
        rating,
        attendanceStatus,
        peopleAttended,
        tags,
        saveWorker,
      };
      await submitWorkerReview(input);
      onSubmitted();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit this rating.');
    } finally {
      setSaving(false);
    }
  }

  return <View style={styles.page}>
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to booking">
        <Ionicons name="chevron-back" size={23} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>Rate your booking</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {workerImageUrl
        ? <Image source={{ uri: workerImageUrl }} style={styles.avatarImage} />
        : <View style={styles.avatar}><Text style={styles.avatarText}>{workerName.charAt(0).toUpperCase() || '?'}</Text></View>}
      <Text style={styles.title}>How was {workerName}'s work?</Text>
      <Text style={styles.subtitle}>{formatDate(startDate)} – {formatDate(endDate)} · {requestTitle}</Text>

      <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel="Rating">
        {[1, 2, 3, 4, 5].map((value) => <Pressable
          key={value}
          style={styles.starButton}
          onPress={() => setRating(value)}
          accessibilityRole="radio"
          accessibilityLabel={`${value} ${value === 1 ? 'star' : 'stars'}`}
          accessibilityState={{ selected: rating === value }}
        >
          <Ionicons name={value <= rating ? 'star' : 'star-outline'} size={43} color={value <= rating ? '#F5A11A' : colors.border} />
        </Pressable>)}
      </View>

      <Text style={styles.sectionTitle}>Did all {peopleNeeded} come?</Text>
      <View style={styles.choiceRow}>
        <Pressable
          style={[styles.choice, attendanceStatus !== 'fewer_attended' && styles.choiceSelected]}
          onPress={() => chooseAttendance('all_attended')}
          accessibilityRole="radio"
          accessibilityState={{ selected: attendanceStatus !== 'fewer_attended' }}
        >
          <Text style={[styles.choiceText, attendanceStatus !== 'fewer_attended' && styles.choiceTextSelected]}>Yes, all {peopleNeeded}</Text>
        </Pressable>
        <Pressable
          style={[styles.choice, attendanceStatus === 'fewer_attended' && styles.choiceSelected]}
          onPress={() => setFollowUpOpen(true)}
          disabled={peopleNeeded <= 1}
          accessibilityRole="radio"
          accessibilityState={{ selected: attendanceStatus === 'fewer_attended', disabled: peopleNeeded <= 1 }}
        ><Text style={[styles.choiceText, attendanceStatus === 'fewer_attended' && styles.choiceTextSelected, peopleNeeded <= 1 && styles.disabledText]}>Fewer came</Text>
        </Pressable>
      </View>
      {attendanceStatus !== 'all_attended' && <Pressable style={styles.followUpButton} onPress={() => setFollowUpOpen(true)} accessibilityRole="button">
        <Text style={styles.followUpText}>
          {attendanceOptions.find((option) => option.value === attendanceStatus)?.label ?? 'What happened?'}
          {attendanceStatus === 'fewer_attended' ? ` · ${peopleAttended} came` : ''}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.primary} />
      </Pressable>}

      <Text style={styles.sectionTitle}>What went well?</Text>
      <View style={styles.tagList}>
        {reviewTags.map((tag) => {
          const selected = tags.includes(tag.value);
          return <Pressable
            key={tag.value}
            style={[styles.tag, selected && styles.tagSelected]}
            onPress={() => toggleTag(tag.value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
          >
            <Text style={[styles.tagText, selected && styles.tagTextSelected]}>{tag.label}</Text>
          </Pressable>;
        })}
      </View>

      <View style={styles.saveCard}>
        <View style={styles.saveCopy}>
          <Text style={styles.saveTitle}>Save to my workers</Text>
          <Text style={styles.saveSubtitle}>Find them first next time</Text>
        </View>
        <Switch
          value={saveWorker}
          onValueChange={setSaveWorker}
          trackColor={{ false: colors.border, true: colors.primary }}
          accessibilityLabel="Save worker to My workers"
        />
      </View>
      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    </ScrollView>

    {followUpOpen && <View style={styles.modalBackdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setFollowUpOpen(false)} accessibilityRole="button" accessibilityLabel="Close attendance details" />
      <View style={styles.sheet}>
        <Text style={styles.sectionTitle}>What happened?</Text>
        {attendanceOptions.filter((option) => peopleNeeded > 1 || option.value !== 'fewer_attended').map((option) => <Pressable
          key={option.value}
          style={[styles.attendanceOption, attendanceStatus === option.value && styles.attendanceOptionSelected]}
          onPress={() => chooseAttendance(option.value)}
          accessibilityRole="radio"
          accessibilityState={{ selected: attendanceStatus === option.value }}
        >
          <Text style={styles.choiceText}>{option.label}</Text>
          <View style={[styles.radio, attendanceStatus === option.value && styles.radioSelected]}>
            {attendanceStatus === option.value && <View style={styles.radioDot} />}
          </View>
        </Pressable>)}
        {attendanceStatus === 'fewer_attended' && <View style={styles.countRow}>
          <Text style={styles.choiceText}>How many came?</Text>
          <Pressable
            style={styles.countButton}
            onPress={() => setPeopleAttended((count) => Math.max(1, count - 1))}
            disabled={peopleAttended <= 1}
            accessibilityRole="button"
            accessibilityLabel="Fewer people attended"
          ><Ionicons name="remove" size={21} color={colors.text} /></Pressable>
          <Text style={styles.count}>{peopleAttended}</Text>
          <Pressable
            style={styles.countButton}
            onPress={() => setPeopleAttended((count) => Math.min(peopleNeeded - 1, count + 1))}
            disabled={peopleAttended >= peopleNeeded - 1}
            accessibilityRole="button"
            accessibilityLabel="More people attended"
          ><Ionicons name="add" size={21} color={colors.text} /></Pressable>
        </View>}
        <Pressable style={styles.primaryButton} onPress={() => setFollowUpOpen(false)} accessibilityRole="button">
          <Text style={styles.primaryButtonText}>Continue</Text>
        </Pressable>
      </View>
    </View>}
    <View style={styles.footer}>
      <Pressable style={[styles.primaryButton, saving && styles.disabled]} onPress={() => { void submit(); }} disabled={saving} accessibilityRole="button">
        {saving && <ActivityIndicator color="#FFFFFF" />}
        <Text style={styles.primaryButtonText}>{saving ? 'Submitting…' : 'Submit rating'}</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: 'transparent' },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 },
  backButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  content: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36 },
  avatarImage: { width: 90, height: 90, borderRadius: 45, marginBottom: 18 },
  avatar: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, marginBottom: 18 },
  avatarText: { color: colors.text, fontSize: 38, fontWeight: '700' },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 8 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 24, marginBottom: 28 },
  starButton: { minWidth: 48, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { width: '100%', color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 8, marginBottom: 14 },
  choiceRow: { width: '100%', flexDirection: 'row', gap: 10 },
  choice: { minHeight: 54, flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 28, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  choiceText: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  choiceTextSelected: { color: '#FFFFFF' },
  disabledText: { color: colors.muted },
  followUpButton: { width: '100%', minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.primarySoft },
  followUpText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  tagList: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 26 },
  tag: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 24, paddingHorizontal: 16 },
  tagSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  tagText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  tagTextSelected: { color: '#FFFFFF' },
  saveCard: { width: '100%', minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, borderRadius: 22, paddingHorizontal: 16 },
  saveCopy: { flex: 1 },
  saveTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  saveSubtitle: { color: colors.muted, fontSize: 15, marginTop: 2 },
  error: { width: '100%', color: colors.danger, fontSize: 14, marginTop: 14 },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18, borderTopWidth: 1, borderTopColor: colors.border },
  primaryButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 30, backgroundColor: colors.primary, paddingHorizontal: 20 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  disabled: { opacity: 0.65 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 26, 46, 0.48)' },
  sheet: { gap: 11, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 30, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.background },
  attendanceOption: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 19 },
  attendanceOptionSelected: { borderWidth: 2, borderColor: colors.primary },
  radio: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.border, borderRadius: 14 },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: colors.primary },
  countRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 8 },
  countButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 21 },
  count: { color: colors.text, fontSize: 23, fontWeight: '800' },
});
