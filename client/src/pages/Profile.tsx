import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Loader2, Upload, UserCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useBindWechat,
  useCurrentUser,
  useLogin,
  useRegister,
  useUnbindWechat,
  useUpdateMyProfile,
  useUploadAvatar,
} from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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

    if (isRegisterMode) {
      await registerMutation.mutateAsync({ username: authUsername, password: authPassword });
    } else {
      await loginMutation.mutateAsync({ username: authUsername, password: authPassword });
    }
    setAuthPassword("");
  };

  const saveProfile = async () => {
    if (!displayName.trim()) {
      toast({ title: "姓名不能为空", variant: "destructive" });
      return;
    }

    await updateProfileMutation.mutateAsync({
      displayName: displayName.trim(),
      avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
      avatarSource: avatarUrl.trim() ? "manual" : "manual",
    });
    toast({ title: "个人资料已更新" });
  };

  const onUploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "请选择图片文件", variant: "destructive" });
      return;
    }

    const dataUrl = await fileToDataUrl(file);
    const result = await uploadAvatarMutation.mutateAsync(dataUrl);
    setAvatarUrl(result.avatarUrl);
    toast({ title: "头像上传成功" });
  };

  const useWechatAvatar = async () => {
    if (!currentUser?.wechatAvatarUrl) return;
    await updateProfileMutation.mutateAsync({
      displayName: displayName.trim(),
      avatarUrl: currentUser.wechatAvatarUrl,
      avatarSource: "wechat",
    });
    setAvatarUrl(currentUser.wechatAvatarUrl);
    toast({ title: "已切换为微信头像" });
  };

  const bindWechat = async () => {
    if (!wechatOpenId || !wechatNickname) {
      toast({ title: "请填写 openId 和微信昵称", variant: "destructive" });
      return;
    }

    await bindWechatMutation.mutateAsync({
      wechatOpenId: wechatOpenId.trim(),
      wechatUnionId: wechatUnionId.trim() || undefined,
      wechatNickname: wechatNickname.trim(),
      wechatAvatarUrl: wechatAvatarUrl.trim() || undefined,
    });
    toast({ title: "微信已绑定（开发模拟）" });
    setShowBindForm(false);
  };

  const unbindWechat = async () => {
    await unbindWechatMutation.mutateAsync();
    toast({ title: "微信绑定已解除" });
  };

  const avatarPreview = useMemo(() => {
    if (avatarUrl.trim()) return avatarUrl.trim();
    if (currentUser?.avatarUrl) return currentUser.avatarUrl;
    return "";
  }, [avatarUrl, currentUser?.avatarUrl]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="outline" size="sm" className="rounded-full">
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回首页
            </Button>
          </Link>
          <h1 className="text-xl font-bold tracking-tight">个人资料</h1>
        </div>

        {isUserLoading && (
          <Card>
            <CardContent className="py-16 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        )}

        {!isUserLoading && !currentUser && (
          <Card>
            <CardHeader>
              <CardTitle>登录后可修改个人资料</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="用户名"
                value={authUsername}
                onChange={(event) => setAuthUsername(event.target.value)}
              />
              <Input
                type="password"
                placeholder="密码"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={submitAuth}
                  disabled={loginMutation.isPending || registerMutation.isPending}
                >
                  {isRegisterMode ? "注册并登录" : "登录"}
                </Button>
                <Button variant="outline" onClick={() => setIsRegisterMode((value) => !value)}>
                  {isRegisterMode ? "切换登录" : "切换注册"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentUser && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>基础信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="avatar"
                      className="w-16 h-16 rounded-full object-cover border"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full border bg-secondary/50 flex items-center justify-center">
                      <UserCircle2 className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">上传头像</label>
                    <div>
                      <label className="inline-flex">
                        <input type="file" accept="image/*" className="hidden" onChange={onUploadAvatar} />
                        <Button type="button" variant="outline" size="sm" asChild>
                          <span>
                            <Upload className="w-4 h-4 mr-1" />
                            选择图片
                          </span>
                        </Button>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">姓名（默认账户名称）</label>
                  <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">头像 URL（可选）</label>
                  <Input
                    placeholder="https://..."
                    value={avatarUrl}
                    onChange={(event) => setAvatarUrl(event.target.value)}
                  />
                </div>

                <Button onClick={saveProfile} disabled={updateProfileMutation.isPending}>
                  保存资料
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>微信绑定（后端操作为主）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  设计上微信绑定应由后端通过 OAuth 获取 openid/unionid 后写入数据库，前端只触发授权。
                  当前页面提供开发态模拟绑定，方便联调未来小程序/公众号体系。
                </p>

                <div className="rounded-xl border p-3 bg-secondary/20">
                  <div>绑定状态：{currentUser.isWechatBound ? "已绑定" : "未绑定"}</div>
                  {currentUser.isWechatBound ? (
                    <div className="mt-1 text-muted-foreground">
                      微信昵称：{currentUser.wechatNickname || "未同步"}
                    </div>
                  ) : null}
                </div>

                {currentUser.isWechatBound && currentUser.wechatAvatarUrl ? (
                  <Button variant="outline" onClick={useWechatAvatar}>
                    使用微信头像
                  </Button>
                ) : null}

                {currentUser.isWechatBound ? (
                  <Button
                    variant="destructive"
                    onClick={unbindWechat}
                    disabled={unbindWechatMutation.isPending}
                  >
                    解除微信绑定
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setShowBindForm((value) => !value)}
                    >
                      {showBindForm ? "收起开发模拟绑定" : "开发模拟绑定"}
                    </Button>
                    {showBindForm ? (
                      <div className="space-y-2 rounded-xl border p-3">
                        <Input
                          placeholder="wechat openid"
                          value={wechatOpenId}
                          onChange={(event) => setWechatOpenId(event.target.value)}
                        />
                        <Input
                          placeholder="wechat unionid（可选）"
                          value={wechatUnionId}
                          onChange={(event) => setWechatUnionId(event.target.value)}
                        />
                        <Input
                          placeholder="wechat nickname"
                          value={wechatNickname}
                          onChange={(event) => setWechatNickname(event.target.value)}
                        />
                        <Input
                          placeholder="wechat avatar url（可选）"
                          value={wechatAvatarUrl}
                          onChange={(event) => setWechatAvatarUrl(event.target.value)}
                        />
                        <Button onClick={bindWechat} disabled={bindWechatMutation.isPending}>
                          提交模拟绑定
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
