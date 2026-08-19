from playwright.sync_api import sync_playwright

def get_chart_data():
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp('http://localhost:9222')
        eagent_page = None
        for ctx in browser.contexts:
            for pg in ctx.pages:
                if 'eagent' in pg.url.lower():
                    eagent_page = pg; break
            if eagent_page: break
            
        fpage = eagent_page.frame('fPage')
        
        # Click Charts tab just to be safe
        try:
            fpage.locator('a:has-text("Charts")').first.click(timeout=3000)
            eagent_page.wait_for_timeout(1000)
        except Exception as e:
            print("Could not click charts tab:", e)
            
        # Try finding Highcharts object
        data = fpage.evaluate('''() => {
            if (typeof Highcharts === 'undefined' || !Highcharts.charts) return null;
            let chart = null;
            // find valid chart instance
            for (let c of Highcharts.charts) {
                if (c && c.series && c.series.length > 0) {
                    chart = c;
                    break;
                }
            }
            if (!chart) return null;
            const series = chart.series[0];
            return series.data.map(point => ({
                agent: point.name || point.category,
                count: point.y
            }));
        }''')
        
        print(f"Chart Data extracted ({len(data) if data else 0} agents):")
        if data:
            for item in data:
                print(f"  {item['agent']}: {item['count']}")
        return data

if __name__ == "__main__":
    get_chart_data()
