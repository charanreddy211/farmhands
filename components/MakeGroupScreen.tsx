import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Text from './AppText';
import AppTextInput from './AppTextInput';
import { Ionicons } from '@expo/vector-icons';
import { fetchLabourGroup, saveLabourGroup } from '../api/groups';

type Props = {
  leaderId: string;
  leaderName: string;
  onBack: () => void;
};

export default function MakeGroupScreen({ leaderId, leaderName, onBack }: Props) {
  const [name, setName] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    fetchLabourGroup(leaderId)
      .then((group) => {
        if (!active) return;
        if (group) {
          setName(group.name);
          setMembers(group.memberNames);
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load your group.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [leaderId]);

  async function save() {
    if (!name.trim()) {
      setError('Give your group a name.');
      return;
    }
    if (members.some((member) => !member.trim())) {
      setError('Fill in or remove every blank member name.');
      return;
    }
    const cleanNames = members.map((member) => member.trim());
    if (new Set(cleanNames.map((member) => member.toLocaleLowerCase())).size !== cleanNames.length) {
      setError('Each member name must be unique.');
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const group = await saveLabourGroup(leaderId, { name: name.trim(), memberNames: cleanNames });
      setMembers(group.memberNames);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save your group. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return <View style={styles.page}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to worker home">
          <Ionicons name="chevron-back" size={21} color="#2563EB" />
        </Pressable>
        <View style={styles.headerCopy}><Text style={styles.kicker}>YOUR CREW</Text><Text style={styles.title}>My work group</Text></View>
      </View>
      <Text style={styles.subtitle}>Add the people who work with you. Farmers can see your group size when they search nearby workers.</Text>

      {loading ? <View style={styles.loading}><ActivityIndicator color="#2563EB" /><Text style={styles.hint}>Loading your saved group…</Text></View> : <>
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}><Ionicons name="people" size={22} color="#2563EB" /></View>
          <View style={styles.summaryCopy}><Text style={styles.summaryTitle}>{name.trim() || 'Your group'}</Text><Text style={styles.summaryMeta}>{members.length + 1} {members.length === 0 ? 'person' : 'people'} including you</Text></View>
        </View>
        <Text style={styles.label}>GROUP NAME</Text>
        <AppTextInput style={styles.input} value={name} onChangeText={(value) => { setName(value); setSaved(false); }} placeholder="For example, Green Field Crew" maxLength={100} accessibilityLabel="Group name" />
        <Text style={styles.label}>GROUP LEADER</Text>
        <View style={styles.memberRow}>
          <View style={styles.personIcon}><Ionicons name="person" size={17} color="#2563EB" /></View>
          <Text style={styles.memberName}>{leaderName || 'You'} (you)</Text>
          <Ionicons name="checkmark-circle" size={19} color="#46764D" />
        </View>
        <View style={styles.membersHeader}>
          <View><Text style={styles.label}>OTHER MEMBERS</Text><Text style={styles.hint}>Names are saved with your group roster.</Text></View>
          <Text style={styles.count}>{members.length}/29</Text>
        </View>
        {members.map((member, index) => <View style={styles.memberRow} key={`member-${index}`}>
          <View style={styles.personIcon}><Ionicons name="person-outline" size={17} color="#2563EB" /></View>
          <AppTextInput style={styles.memberInput} value={member} onChangeText={(value) => {
            setMembers((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
            setSaved(false);
          }} placeholder={`Member ${index + 1} name`} maxLength={80} accessibilityLabel={`Member ${index + 1} name`} />
          <Pressable onPress={() => { setMembers((current) => current.filter((_, itemIndex) => itemIndex !== index)); setSaved(false); }} accessibilityRole="button" accessibilityLabel={`Remove member ${index + 1}`}>
            <Ionicons name="close-circle-outline" size={21} color="#64748B" />
          </Pressable>
        </View>)}
        <Pressable style={styles.addButton} onPress={() => { setMembers((current) => current.length < 29 ? [...current, ''] : current); setSaved(false); }} disabled={members.length >= 29} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={19} color="#2563EB" />
          <Text style={styles.addText}>{members.length >= 29 ? 'Group is at the 30-person limit' : 'Add a group member'}</Text>
        </Pressable>
        {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        {saved && <Text style={styles.success} accessibilityRole="alert">Your group has been saved.</Text>}
        <Pressable style={[styles.saveButton, saving && styles.disabled]} onPress={() => { void save(); }} disabled={saving} accessibilityRole="button">
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save group</Text>}
        </Pressable>
      </>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: 'transparent' },
  content: { width: '100%', maxWidth: 700, alignSelf: 'center', padding: 20, paddingTop: 26, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15 },
  back: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  kicker: { color: '#2563EB', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#0F172A', fontSize: 27, fontWeight: '800', marginTop: 2 },
  subtitle: { color: '#64748B', fontSize: 15, lineHeight: 22, marginBottom: 20 },
  loading: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 10 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 24, backgroundColor: '#EFF6FF', padding: 16, marginBottom: 20 },
  summaryIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1 },
  summaryTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800' },
  summaryMeta: { color: '#64748B', fontSize: 14, marginTop: 4 },
  label: { color: '#64748B', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginBottom: 7 },
  input: { minHeight: 54, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 22, backgroundColor: '#FFFFFF', paddingHorizontal: 16, color: '#0F172A', fontSize: 16, marginBottom: 18 },
  memberRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 22, backgroundColor: '#FFFFFF', paddingHorizontal: 14, marginBottom: 10 },
  personIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  memberName: { flex: 1, color: '#0F172A', fontSize: 16, fontWeight: '600' },
  membersHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3, marginBottom: 11 },
  hint: { color: '#64748B', fontSize: 12, lineHeight: 17 },
  count: { color: '#64748B', fontSize: 13, fontWeight: '700' },
  memberInput: { flex: 1, minHeight: 50, color: '#0F172A', fontSize: 15 },
  addButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  addText: { color: '#2563EB', fontSize: 15, fontWeight: '700' },
  error: { color: '#A0443D', fontSize: 13, lineHeight: 18, marginVertical: 8 },
  success: { color: '#32653D', fontSize: 13, marginVertical: 8 },
  saveButton: { minHeight: 58, borderRadius: 30, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  saveText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  disabled: { opacity: 0.65 },
});
