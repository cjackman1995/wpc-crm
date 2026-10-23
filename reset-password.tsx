import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button, ErrorBox, Field, Loading } from "@/components/ui";
import { changePassword } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/theme";

/** Landing page for password-reset and invite links from Supabase emails. */
export default function ResetPassword() {
  const { session, loading } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== pw2) return setError("The passwords don't match.");
    setBusy(true);
    try {
      await changePassword(pw);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: colors.nav }}>
      <View style={{ width: "100%", maxWidth: 380, backgroundColor: "#fff", borderRadius: 10, padding: 28, gap: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Set your password</Text>
        {loading ? (
          <Loading />
        ) : !session ? (
          <>
            <Text style={{ color: colors.textSecondary }}>This link has expired or was already used. Request a new one from the sign-in page.</Text>
            <Button label="Back to sign in" onPress={() => router.replace("/login")} />
          </>
        ) : (
          <>
            <ErrorBox message={error} />
            <Field label="New password" value={pw} onChangeText={setPw} secure autoFocus />
            <Field label="Confirm password" value={pw2} onChangeText={setPw2} secure onSubmit={save} />
            <Button label="Save password" variant="primary" onPress={save} busy={busy} />
          </>
        )}
      </View>
    </View>
  );
}
