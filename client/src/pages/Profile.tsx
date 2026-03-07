import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Loader2, Upload, UserCircle2, LogOut, MessageCircle, Unlink, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";
import {
  useBindWechat,
  useCurrentUser,
  useLogin,
  useLogout,
  useRegister,
  useUnbindWechat,
  useUpdateMyProfile,
  useUploadAvatar,
} from "@/hooks/useAuth";
import { PageShell, AuthCard } from "@/components/PageShell";

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: isUserLoading } = useCurrentUser();
  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const logoutMutation = useLogout();
  const updateProfileMutation = useUpdateMyProfile();
  const uploadAvatarMutation = useUploadAvatar();
  const bindWechatMutation = useBindWechat();
  const unbindWechatMutation = useUnbindWechat();

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [wechatOpenId, setWechatOpenId] = useState("");
  const [wechatUnionId, setWechatUnionId] = useState("");
  const [wechatNickname, setWechatNickname] = useState("");
  const [wechatAvatarUrl, setWechatAvatarUrl] = useState("");
  const [showBindForm, setShowBindForm] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    setDisplayName(currentUser.displayName || currentUser.username);
    setAvatarUrl(currentUser.avatarUrl || "");
    setWechatNickname(currentUser.wechatNickname || "");
    setWechatAvatarUrl(currentUser.wechatAvatarUrl || "");
  }, [currentUser]);

  const submitAuth = async () => {
    if (!authUsername || !authPassword) return;
    try {
      if (isRegisterMode) {
        await registerMutation.mutateAsync({ username: authUsername, password: authPassword });
      } else {
        await loginMutation.mutateAsync({ username: authUsername, password: authPassword });
      }
      setAuthPassword("");
    } catch (error) {
      toast({
        title: isRegisterMode ? "注册失败" : "登录失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const saveProfile = async () => {
    if (!displayName.trim()) {
      toast({ title: "姓名不能为空", variant: "destructive" });
      return;
    }
    try {
      const payload: {
        displayName: string;
        avatarUrl?: string | null;
        avatarSource?: "manual" | "upload" | "wechat";
      } = { displayName: displayName.trim() };

      const desiredAvatarUrl = avatarUrl.trim() ? avatarUrl.trim() : null;
      const currentAvatarUrl = currentUser?.avatarUrl ?? null;
      if (desiredAvatarUrl !== currentAvatarUrl) {
        payload.avatarUrl = desiredAvatarUrl;
        payload.avatarSource = "manual";
      }

      await updateProfileMutation.mutateAsync(payload);
      toast({ title: "个人资料已更新" });
    } catch (error) {
      toast({
        title: "保存失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const onUploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "请选择图片文件", variant: "destructive" });
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const result = await uploadAvatarMutation.mutateAsync(dataUrl);
      setAvatarUrl(result.avatarUrl);
      toast({ title: "头像上传成功" });
    } catch (error) {
      toast({
        title: "头像上传失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const useWechatAvatar = async () => {
    if (!currentUser?.wechatAvatarUrl) return;
    try {
      await updateProfileMutation.mutateAsync({
        displayName: displayName.trim(),
        avatarUrl: currentUser.wechatAvatarUrl,
        avatarSource: "wechat",
      });
      setAvatarUrl(currentUser.wechatAvatarUrl);
      toast({ title: "已切换为微信头像" });
    } catch (error) {
      toast({
        title: "切换失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const bindWechat = async () => {
    if (!wechatOpenId || !wechatNickname) {
      toast({ title: "请填写 openId 和微信昵称", variant: "destructive" });
      return;
    }
    try {
      await bindWechatMutation.mutateAsync({
        wechatOpenId: wechatOpenId.trim(),
        wechatUnionId: wechatUnionId.trim() || undefined,
        wechatNickname: wechatNickname.trim(),
        wechatAvatarUrl: wechatAvatarUrl.trim() || undefined,
      });
      toast({ title: "微信已绑定（开发模拟）" });
      setShowBindForm(false);
    } catch (error) {
      toast({
        title: "绑定失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const unbindWechat = async () => {
    try {
      await unbindWechatMutation.mutateAsync();
      toast({ title: "微信绑定已解除" });
    } catch (error) {
      toast({
        title: "解绑失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      toast({ title: "已退出登录" });
    } catch (error) {
      toast({
        title: "退出失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const avatarPreview = useMemo(() => {
    if (avatarUrl.trim()) return avatarUrl.trim();
    if (currentUser?.avatarUrl) return currentUser.avatarUrl;
    return "";
  }, [avatarUrl, currentUser?.avatarUrl]);

  const logoutAction = currentUser ? (
    <button
      className="flex items-center gap-1 text-sm text-destructive hover:text-destructive/80 transition-colors"
      onClick={handleLogout}
      disabled={logoutMutation.isPending}
      data-testid="button-logout"
    >
      <LogOut className="w-4 h-4" />
      <span>退出</span>
    </button>
  ) : undefined;

  return (
    <PageShell title="个人资料" actions={logoutAction}>
      <div className="space-y-5">
        {isUserLoading && (
          <div className="rounded-2xl border bg-card p-16 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isUserLoading && !currentUser && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <AuthCard
              isRegisterMode={isRegisterMode}
              setIsRegisterMode={setIsRegisterMode}
              authUsername={authUsername}
              setAuthUsername={setAuthUsername}
              authPassword={authPassword}
              setAuthPassword={setAuthPassword}
              onSubmit={submitAuth}
              isPending={loginMutation.isPending || registerMutation.isPending}
              prompt="登录后可修改个人资料"
            />
          </motion.div>
        )}

        {currentUser && (
          <>
            <motion.div
              className="rounded-2xl border bg-card p-6 space-y-5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              data-testid="card-profile"
            >
              <div className="flex items-center gap-4">
                <div className="relative group">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="avatar"
                      className="w-20 h-20 rounded-full object-cover border-2 border-border"
                      data-testid="img-avatar"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full border-2 border-border bg-secondary/50 flex items-center justify-center">
                      <UserCircle2 className="w-10 h-10 text-muted-foreground" data-testid="img-avatar-placeholder" />
                    </div>
                  )}
                  <label className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 flex items-center justify-center cursor-pointer transition-colors">
                    <Upload className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onUploadAvatar}
                      data-testid="input-avatar-upload"
                    />
                  </label>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold truncate" data-testid="text-display-name">
                    {currentUser.displayName || currentUser.username}
                  </p>
                  <p className="text-sm text-muted-foreground" data-testid="text-username">
                    @{currentUser.username}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">显示名称</label>
                  <input
                    className="w-full h-10 px-3 rounded-xl bg-secondary border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    data-testid="input-display-name"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">头像 URL（可选）</label>
                  <input
                    className="w-full h-10 px-3 rounded-xl bg-secondary border-0 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="https://..."
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    data-testid="input-avatar-url"
                  />
                </div>
              </div>

              <button
                className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                onClick={saveProfile}
                disabled={updateProfileMutation.isPending}
                data-testid="button-save-profile"
              >
                {updateProfileMutation.isPending ? "保存中…" : "保存资料"}
              </button>
            </motion.div>

            <motion.div
              className="rounded-2xl border bg-card p-6 space-y-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              data-testid="card-wechat"
            >
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-500" />
                <h2 className="text-base font-semibold">微信绑定</h2>
              </div>

              <p className="text-sm text-muted-foreground">
                微信绑定由后端通过 OAuth 完成，当前为开发模拟模式。
              </p>

              <div className="rounded-xl bg-secondary/50 p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" data-testid="text-wechat-status">
                    {currentUser.isWechatBound ? "已绑定" : "未绑定"}
                  </p>
                  {currentUser.isWechatBound && currentUser.wechatNickname && (
                    <p className="text-sm text-muted-foreground" data-testid="text-wechat-nickname">
                      {currentUser.wechatNickname}
                    </p>
                  )}
                </div>
                <div
                  className={`w-2.5 h-2.5 rounded-full ${currentUser.isWechatBound ? "bg-green-500" : "bg-muted-foreground/30"}`}
                />
              </div>

              {currentUser.isWechatBound && currentUser.wechatAvatarUrl && (
                <button
                  className="w-full h-10 rounded-xl border text-sm font-medium hover:bg-accent transition-colors"
                  onClick={useWechatAvatar}
                  data-testid="button-use-wechat-avatar"
                >
                  使用微信头像
                </button>
              )}

              {currentUser.isWechatBound ? (
                <button
                  className="w-full h-10 rounded-xl border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  onClick={unbindWechat}
                  disabled={unbindWechatMutation.isPending}
                  data-testid="button-unbind-wechat"
                >
                  <Unlink className="w-4 h-4" />
                  解除微信绑定
                </button>
              ) : (
                <>
                  <button
                    className="w-full h-10 rounded-xl border text-sm font-medium hover:bg-accent transition-colors flex items-center justify-center gap-1.5"
                    onClick={() => setShowBindForm((v) => !v)}
                    data-testid="button-toggle-bind-form"
                  >
                    {showBindForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {showBindForm ? "收起模拟绑定" : "开发模拟绑定"}
                  </button>

                  <AnimatePresence>
                    {showBindForm && (
                      <motion.div
                        className="space-y-2 rounded-xl border p-4"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <input
                          className="w-full h-10 px-3 rounded-xl bg-secondary border-0 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="wechat openid"
                          value={wechatOpenId}
                          onChange={(e) => setWechatOpenId(e.target.value)}
                          data-testid="input-wechat-openid"
                        />
                        <input
                          className="w-full h-10 px-3 rounded-xl bg-secondary border-0 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="wechat unionid（可选）"
                          value={wechatUnionId}
                          onChange={(e) => setWechatUnionId(e.target.value)}
                          data-testid="input-wechat-unionid"
                        />
                        <input
                          className="w-full h-10 px-3 rounded-xl bg-secondary border-0 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="wechat nickname"
                          value={wechatNickname}
                          onChange={(e) => setWechatNickname(e.target.value)}
                          data-testid="input-wechat-nickname"
                        />
                        <input
                          className="w-full h-10 px-3 rounded-xl bg-secondary border-0 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="wechat avatar url（可选）"
                          value={wechatAvatarUrl}
                          onChange={(e) => setWechatAvatarUrl(e.target.value)}
                          data-testid="input-wechat-avatar-url"
                        />
                        <button
                          className="w-full h-10 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-600/90 transition-colors disabled:opacity-50"
                          onClick={bindWechat}
                          disabled={bindWechatMutation.isPending}
                          data-testid="button-submit-bind"
                        >
                          提交模拟绑定
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </motion.div>
          </>
        )}
      </div>
    </PageShell>
  );
}
