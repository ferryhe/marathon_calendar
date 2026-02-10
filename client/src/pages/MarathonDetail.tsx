import { useRoute, Link } from "wouter";
import { ArrowLeft, Calendar, MapPin, Star } from "lucide-react";
import { useMarathon } from "@/hooks/useMarathons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatDate(dateValue?: string | null) {
  if (!dateValue) {
    return "待更新";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "待更新";
  }

  return date.toLocaleDateString("zh-CN");
}

export default function MarathonDetailPage() {
  const [matched, params] = useRoute("/marathons/:id");
  const marathonId = matched ? params.id : "";
  const { data, isLoading, error } = useMarathon(marathonId);

  if (!matched) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="outline" size="sm" className="rounded-full">
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回列表
            </Button>
          </Link>
          <h1 className="text-xl font-bold tracking-tight">赛事详情</h1>
        </div>

        {isLoading && (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              正在加载赛事详情...
            </CardContent>
          </Card>
        )}

        {error && (
          <Card>
            <CardContent className="py-16 text-center">
              <p className="text-destructive font-medium">加载赛事详情失败</p>
              <p className="text-sm text-muted-foreground mt-2">
                {(error as Error).message}
              </p>
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            <Card>
              <CardHeader className="space-y-3">
                <CardTitle className="text-2xl leading-tight">{data.name}</CardTitle>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {data.city || data.country || "待更新"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    最近赛事：{formatDate(data.editions?.[0]?.raceDate)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Star className="w-4 h-4" />
                    评分：{data.reviews.averageRating.toFixed(1)} / 5
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.description ? (
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {data.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无赛事简介</p>
                )}

                {data.websiteUrl && (
                  <a
                    href={data.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex"
                  >
                    <Button>前往赛事官网</Button>
                  </a>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>历年举办信息</CardTitle>
              </CardHeader>
              <CardContent>
                {data.editions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无历年信息</p>
                ) : (
                  <div className="space-y-3">
                    {data.editions.map((edition) => (
                      <div
                        key={edition.id}
                        className="rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{edition.year} 年赛事</p>
                          <p className="text-xs text-muted-foreground">
                            比赛日期：{formatDate(edition.raceDate)}
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {edition.registrationStatus ?? "待更新"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>评论与评分</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  共 {data.reviews.count} 条评论，平均分 {data.reviews.averageRating.toFixed(1)}
                </div>

                {data.reviews.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无评论</p>
                ) : (
                  <div className="space-y-3">
                    {data.reviews.items.slice(0, 10).map((review) => (
                      <div key={review.id} className="rounded-xl border p-4 space-y-2">
                        <div className="text-sm font-medium">
                          {review.userDisplayName} · {review.rating} 分
                        </div>
                        <p className="text-sm text-foreground/90">
                          {review.comment || "该用户未填写评论内容"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
