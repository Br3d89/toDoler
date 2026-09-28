import { TestBed, async } from '@angular/core/testing';
import { AppComponent } from './app.component';
describe('AppComponent', () => {
  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [
        AppComponent
      ],
    }).compileComponents();
  }));
  it('should create the app', async(() => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.debugElement.componentInstance;
    expect(app).toBeTruthy();
  }));
  it(`should have as title 'toDoler'`, async(() => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.debugElement.componentInstance;
    expect(app.title).toEqual('toDoler');
  }));
  it('should render title in a h1 tag', async(() => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.debugElement.nativeElement;
    expect(compiled.querySelector('h1').textContent).toContain('Welcome to toDoler!');
  }));
  it('should give every list item a title', async(() => {
    const titles = renderListItemTitles();
    expect(titles.length).toBeGreaterThan(0);
    titles.forEach((title) => expect(title).toBeTruthy());
  }));
  it('should title each list item after the link it holds', async(() => {
    expect(renderListItemTitles()).toEqual([
      'Tour of Heroes: build your first Angular app step by step',
      'CLI Documentation: reference for the Angular CLI commands',
      'Angular blog: news and release notes from the Angular team'
    ]);
  }));
});

function renderListItemTitles(): string[] {
  const fixture = TestBed.createComponent(AppComponent);
  fixture.detectChanges();
  const items = fixture.debugElement.nativeElement.querySelectorAll('li');
  const titles: string[] = [];
  for (let i = 0; i < items.length; i++) {
    titles.push(items[i].getAttribute('title'));
  }
  return titles;
}
