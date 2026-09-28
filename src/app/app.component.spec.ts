import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AppComponent
      ],
    }).compileComponents();
  });
  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
  it(`should have as title 'toDoler'`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('toDoler');
  });
  it('should render title in a h1 tag', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')!.textContent).toContain('Welcome to toDoler!');
  });
  it('should give every list item a title', () => {
    const titles = renderListItemTitles();
    expect(titles.length).toBeGreaterThan(0);
    titles.forEach((title) => expect(title).toBeTruthy());
  });
  it('should title each list item after the link it holds', () => {
    expect(renderListItemTitles()).toEqual([
      'Tour of Heroes: build your first Angular app step by step',
      'CLI Documentation: reference for the Angular CLI commands',
      'Angular blog: news and release notes from the Angular team'
    ]);
  });
});

function renderListItemTitles(): (string | null)[] {
  const fixture = TestBed.createComponent(AppComponent);
  fixture.detectChanges();
  const items = fixture.nativeElement.querySelectorAll('li') as NodeListOf<HTMLLIElement>;
  return Array.from(items).map((item) => item.getAttribute('title'));
}
