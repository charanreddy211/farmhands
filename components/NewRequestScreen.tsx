import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CreateRequestInput } from '../api/requests';

type DateField = 'start' | 'end';
type NewRequestScreenProps = { onPublish: (input: CreateRequestInput) => Promise<void> };

function dateInputValue(date: Date | null) {
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '';
}

function parseDateInput(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dateLabel(date: Date | null) {
  return date ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Choose date';
}

function Icon({ name, size = 18, color = '#53634B' }: { name: keyof typeof Ionicons.glyphMap; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function NewRequestScreen({ onPublish }: NewRequestScreenProps) {
  const [requestTitle, setRequestTitle] = useState('');
  const [area, setArea] = useState('');
  const [people, setPeople] = useState('');
  const [pay, setPay] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [activeDateField, setActiveDateField] = useState<DateField | null>(null);
  const [dateDraft, setDateDraft] = useState(new Date());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  function setRequestDate(field: DateField, date: Date | null) {
    if (field === 'start') {
      setStartDate(date);
      if (date && endDate && endDate < date) setEndDate(date);
    } else {
      setEndDate(date);
    }
  }

  function openDatePicker(field: DateField) {
    const value = field === 'start' ? startDate : endDate;
    const initialDate = value ?? (field === 'end' ? startDate : null) ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initialDate,
        mode: 'date',
        minimumDate: field === 'end' ? startDate ?? undefined : undefined,
        maximumDate: field === 'start' ? endDate ?? undefined : undefined,
        onChange: (event, selectedDate) => {
          if (event.type === 'set' && selectedDate) setRequestDate(field, selectedDate);
        },
      });
      return;
    }
    setDateDraft(initialDate);
    setActiveDateField(field);
  }

  function saveDateDraft() {
    if (activeDateField) setRequestDate(activeDateField, dateDraft);
    setActiveDateField(null);
  }

  async function publishRequest() {
    if (!requestTitle.trim() || !area.trim() || !people.trim() || !pay.trim() || !startDate || !endDate) {
      setSubmitError('Complete every field and choose both dates before publishing.');
      return;
    }
    const peopleNeeded = Number(people);
    const payPerDay = Number(pay.replace(/[^\d]/g, ''));
    if (!Number.isInteger(peopleNeeded) || peopleNeeded < 1 || !Number.isInteger(payPerDay) || payPerDay < 1 || endDate < startDate) {
      setSubmitError('Enter a valid number of people and daily pay, and check the date range.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await onPublish({
        title: requestTitle.trim(),
        area: area.trim(),
        startDate: dateInputValue(startDate),
        endDate: dateInputValue(endDate),
        peopleNeeded,
        payPerDay,
      });
      setRequestTitle('');
      setArea('');
      setPeople('');
      setPay('');
      setStartDate(null);
      setEndDate(null);
    } catch {
      setSubmitError('Could not save the request. Check the server connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return <View style={styles.formCard}>
    <Text style={styles.formLabel}>What work needs doing?</Text>
    <TextInput style={styles.input} value={requestTitle} onChangeText={setRequestTitle} placeholder="e.g. Tomato harvesting" placeholderTextColor="#9B9E94" />
    <Text style={styles.formLabel}>Where is the farm?</Text>
    <TextInput style={styles.input} value={area} onChangeText={setArea} placeholder="Village or taluk" placeholderTextColor="#9B9E94" />
    <View style={styles.formRow}>
      <View style={styles.formHalf}>
        <Text style={styles.formLabel}>People needed</Text>
        <TextInput style={styles.input} value={people} onChangeText={setPeople} keyboardType="number-pad" placeholder="e.g. 6" placeholderTextColor="#9B9E94" />
      </View>
      <View style={styles.formHalf}>
        <Text style={styles.formLabel}>Pay per day</Text>
        <TextInput style={styles.input} value={pay} onChangeText={setPay} placeholder="₹ 550" placeholderTextColor="#9B9E94" />
      </View>
    </View>
    <Text style={styles.formLabel}>When do you need them?</Text>
    {Platform.OS === 'web' ? <View style={styles.formRow}>
      {(['start', 'end'] as const).map((field) => {
        const selectedDate = field === 'start' ? startDate : endDate;
        return <View key={field} style={styles.formHalf}>
          <Text style={styles.formLabel}>{field === 'start' ? 'Start date' : 'End date'}</Text>
          <input
            type="date"
            value={dateInputValue(selectedDate)}
            min={field === 'end' ? dateInputValue(startDate) : undefined}
            max={field === 'start' ? dateInputValue(endDate) : undefined}
            onChange={(event) => setRequestDate(field, parseDateInput(event.currentTarget.value))}
            style={{ height: 47, width: '100%', boxSizing: 'border-box', border: '1px solid #DEDACF', borderRadius: 9, padding: '0 12px', color: '#344636', backgroundColor: '#FFFEFA', fontSize: 14 }}
          />
        </View>;
      })}
    </View> : <View style={styles.formRow}>
      {(['start', 'end'] as const).map((field) => <View key={field} style={styles.formHalf}>
        <Text style={styles.formLabel}>{field === 'start' ? 'Start date' : 'End date'}</Text>
        <Pressable style={styles.inputButton} onPress={() => openDatePicker(field)}>
          <Icon name="calendar-outline" />
          <Text style={[styles.inputButtonText, (field === 'start' ? startDate : endDate) && styles.selectedDate]}>{dateLabel(field === 'start' ? startDate : endDate)}</Text>
        </Pressable>
      </View>)}
    </View>}
    <Modal visible={activeDateField !== null && Platform.OS === 'ios'} transparent animationType="fade" onRequestClose={() => setActiveDateField(null)}>
      <View style={styles.datePickerBackdrop}>
        <View style={styles.datePickerSheet}>
          <View style={styles.datePickerHeader}>
            <Pressable onPress={() => setActiveDateField(null)}><Text style={styles.datePickerAction}>Cancel</Text></Pressable>
            <Text style={styles.formLabel}>{activeDateField === 'start' ? 'Start date' : 'End date'}</Text>
            <Pressable onPress={saveDateDraft}><Text style={[styles.datePickerAction, styles.datePickerActionText]}>Done</Text></Pressable>
          </View>
          <DateTimePicker
            value={dateDraft}
            mode="date"
            display="spinner"
            minimumDate={activeDateField === 'end' ? startDate ?? undefined : undefined}
            maximumDate={activeDateField === 'start' ? endDate ?? undefined : undefined}
            onChange={(_, selectedDate) => { if (selectedDate) setDateDraft(selectedDate); }}
          />
        </View>
      </View>
    </Modal>
    {!!submitError && <Text style={styles.submitError}>{submitError}</Text>}
    <Pressable style={[styles.publishButton, submitting && styles.publishButtonDisabled]} onPress={publishRequest} disabled={submitting}>
      <Text style={styles.publishText}>{submitting ? 'Publishing...' : 'Publish request'}</Text>
      <Icon name="arrow-forward" color="#F6F1E8" />
    </Pressable>
    <Text style={styles.formHint}>Your request will be shared with nearby verified labour groups.</Text>
  </View>;
}

const styles = StyleSheet.create({
  formCard: { backgroundColor: '#FFFDF8', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#ECE7DD' },
  formLabel: { color: '#53634B', fontSize: 12, fontWeight: '800', marginBottom: 7, marginTop: 5 },
  input: { height: 47, borderWidth: 1, borderColor: '#DEDACF', borderRadius: 9, paddingHorizontal: 13, color: '#344636', fontSize: 14, backgroundColor: '#FFFEFA', marginBottom: 11 },
  formRow: { flexDirection: 'row', gap: 12 },
  formHalf: { flex: 1 },
  inputButton: { height: 47, borderWidth: 1, borderColor: '#DEDACF', borderRadius: 9, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 17 },
  inputButtonText: { flex: 1, color: '#9B9E94', fontSize: 14 },
  selectedDate: { color: '#344636', fontWeight: '700' },
  datePickerBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.35)', justifyContent: 'flex-end' },
  datePickerSheet: { backgroundColor: '#FFFDF8', paddingHorizontal: 20, paddingTop: 15, paddingBottom: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  datePickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  datePickerAction: { color: '#9B9E94', fontSize: 14, fontWeight: '700' },
  datePickerActionText: { color: '#244630' },
  publishButton: { backgroundColor: '#244630', height: 51, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 4 },
  publishButtonDisabled: { opacity: 0.65 },
  publishText: { color: '#F6F1E8', fontSize: 15, fontWeight: '800' },
  submitError: { color: '#A44E43', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  formHint: { color: '#9B9E94', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 13 },
});
