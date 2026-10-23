import { Redirect } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, ErrorBox, Field, Notice } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme";

export default function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!loading && session) return <Redirect href="/" />;

  const signIn = async () => {
    setError(null);
    setInfo(null);
    if (!email || !password) return setError("Enter your email and password.");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
  };

  const forgot = async () => {
    setError(null);
    if (!email) return setError("Enter your email first, then click “Forgot password”.");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setInfo("If that email has an account, a reset link is on its way.");
  };

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: colors.nav }}>
      <View style={{ width: "100%", maxWidth: 380, backgroundColor: "#fff", borderRadius: 10, padding: 28, gap: 16 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text }}>Sales CRM</Text>
          <Text style={{ color: colors.textSecondary }}>Sign in to your pipeline</Text>
        </View>
        <ErrorBox message={error} />
        {info ? <Notice tone="good">{info}</Notice> : null}
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoFocus />
        <Field label="Password" value={password} onChangeText={setPassword} secure onSubmit={signIn} />
        <Button label="Sign in" variant="primary" onPress={signIn} busy={busy} />
        <Pressable onPress={forgot} role="link">
          <Text style={{ color: colors.primaryDark, textAlign: "center" }}>Forgot password?</Text>
        </Pressable>
        <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: "center" }}>
          Accounts are created by your sales manager.
        </Text>
      </View>
    </View>
  );
}
