/**
 * 42trip（42公里）跑步赛事爬虫
 * 
 * 抓取跑步赛事数据
 * 用法：cd /opt/marathon_calendar && npx tsx crawler/42tripCrawler.ts
 */

import { load } from "cheerio";

// ================== 配置 ==================

const CONFIG = {
  // 42trip 网站
  baseUrl: "https://www.42trip.com",
  eventsPage: "https://www.42trip.com/race/list",
  timeout: 15000,
  retryMax: 3,
  retryBackoffMs: 1000,
};

// ================== 类型 ==================

interface RaceEvent {
  name: string;
  city: string;
  province: string;
  country: string;
  raceDate: string;
  url: string;
  description?: string;
  registrationStatus?: string;
  registrationUrl?: string;
  eventType?: string;
}

// ================== 工具函数 ==================

async function fetchWithRetry(
  url: string,
  options: RequestInit & { timeout: number; retryMax: number; retryBackoffMs: number }
): Promise<string> {
  const { timeout, retryMax, retryBackoffMs, ...fetchOptions } = options;
  
  for (let attempt = 1; attempt <= retryMax; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.text();
    } catch (error) {
      if (attempt === retryMax) {
        throw error;
      }
      console.log(`Attempt ${attempt} failed for ${url}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, retryBackoffMs * attempt));
    }
  }
  
  throw new Error("All retries failed");
}

/**
 * 解析日期
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  const cleaned = dateStr.trim()
    .replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/\s+/g, ' ');
  
  const dateMatch = cleaned.match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return null;
}

/**
 * 解析省份城市
 */
function parseLocation(locationStr: string): { city: string; province: string } {
  if (!locationStr) {
    return { city: '', province: '' };
  }
  
  const cleaned = locationStr.trim();
  const provinces = [
    '北京', '上海', '天津', '重庆',
    '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西',
    '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西',
    '甘肃', '青海', '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门'
  ];
  
  for (const province of provinces) {
    if (cleaned.startsWith(province)) {
      const city = cleaned.slice(province.length).trim();
      return { city: city || province, province };
    }
  }
  
  return { city: cleaned, province: '' };
}

/**
 * 判断赛事类型
 */
function getEventType(name: string): string {
  const text = name.toLowerCase();
  
  if (text.includes('马拉松') || text.includes('marathon')) return '马拉松';
  if (text.includes('半程') || text.includes('half')) return '半程马拉松';
  if (text.includes('越野') || text.includes('trail')) return '越野赛';
  if (text.includes('铁人')) return '铁人三项';
  if (text.includes('徒步')) return '徒步';
  if (text.includes('健康跑') || text.includes('欢乐跑')) return '健康跑';
  if (text.includes('超级马拉松') || text.includes('超马')) return '超级马拉松';
  
  return '跑步';
}

/**
 * 判断报名状态
 */
function getRegistrationStatus(text: string): string {
  const lower = text.toLowerCase();
  
  if (lower.includes('报名中')) return '报名中';
  if (lower.includes('已截止') || lower.includes('报名结束') || lower.includes('报名已满')) return '已截止';
  if (lower.includes('即将')) return '即将开始';
  
  return '待更新';
}

// ================== 爬虫核心 ==================

async function crawl42tripEvents(): Promise<RaceEvent[]> {
  const events: RaceEvent[] = [];
  
  console.log(`正在抓取42trip赛事数据...`);
  
  try {
    const html = await fetchWithRetry(CONFIG.eventsPage, {
      timeout: CONFIG.timeout,
      retryMax: CONFIG.retryMax,
      retryBackoffMs: CONFIG.retryBackoffMs,
    });
    
    const $ = load(html);
    
    // 尝试多种选择器
    const selectors = [
      '.race-list .race-item',
      '.event-list .event-item',
      '.races .race',
      '[class*="race-item"]',
      '[class*="event-item"]',
      '.card-race',
      '.race-card',
    ];
    
    let foundEvents = false;
    
    for (const selector of selectors) {
      const $events = $(selector);
      
      if ($events.length > 0) {
        foundEvents = true;
        console.log(`使用选择器 "${selector}" 找到 ${$events.length} 个赛事`);
        
        $events.each((_, el) => {
          const $el = $(el);
          
          const name = $el.find('h3, h2, .title, .name, [class*="title"], [class*="name"]').first().text().trim();
          const dateText = $el.find('.date, .time, [class*="date"], [class*="time"]').first().text().trim();
          const locationText = $el.find('.city, .location, [class*="city"], [class*="location"], .province').first().text().trim();
          const link = $el.find('a[href*="race"], a[href*="event"]').first();
          const url = link.attr('href');
          const fullUrl = url ? (url.startsWith('http') ? url : `${CONFIG.baseUrl}${url}`) : '';
          const statusText = $el.find('.status, .register-status, [class*="status"]').first().text().trim();
          
          if (name) {
            const { city, province } = parseLocation(locationText);
            const raceDate = parseDate(dateText);
            
            events.push({
              name,
              city,
              province,
              country: 'China',
              raceDate: raceDate || '',
              url: fullUrl,
              eventType: getEventType(name),
              registrationStatus: getRegistrationStatus(statusText),
            });
          }
        });
        
        break;
      }
    }
    
    if (!foundEvents) {
      console.log('页面结构未匹配，尝试备用方案...');
      // 备用：从所有链接中提取
      $('a[href*="/race/"], a[href*="/races/"]').each((_, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        const text = $el.text().trim();
        
        if (text && href && text.length > 2 && text.length < 100) {
          const fullUrl = href.startsWith('http') ? href : `${CONFIG.baseUrl}${href}`;
          
          events.push({
            name: text,
            city: '',
            province: '',
            country: 'China',
            raceDate: '',
            url: fullUrl,
            registrationStatus: '待更新',
          });
        }
      });
    }
    
  } catch (error) {
    console.error(`抓取42trip赛事失败:`, error);
  }
  
  return events;
}

// ================== 主函数 ==================

async function main() {
  console.log('='.repeat(50));
  console.log('42trip 跑步赛事爬虫');
  console.log('='.repeat(50));
  
  const events = await crawl42tripEvents();
  
  console.log(`\n共抓取到 ${events.length} 个赛事`);
  
  // 打印前10个赛事
  console.log('\n前10个赛事预览:');
  events.slice(0, 10).forEach((event, index) => {
    console.log(`${index + 1}. ${event.name}`);
    console.log(`   城市: ${event.city || event.province || '未知'}`);
    console.log(`   日期: ${event.raceDate || '待定'}`);
    console.log(`   类型: ${event.eventType || '跑步'}`);
    console.log(`   状态: ${event.registrationStatus}`);
    console.log('');
  });
  
  // 保存到文件
  const fs = await import('fs');
  const outputPath = '/opt/marathon_calendar/crawler/data/42trip_events.json';
  
  const dir = '/opt/marathon_calendar/crawler/data';
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(events, null, 2), 'utf-8');
  console.log(`数据已保存到: ${outputPath}`);
  
  return events;
}

if (require.main === module) {
  main().catch(console.error);
}

export { crawl42tripEvents, RaceEvent };
