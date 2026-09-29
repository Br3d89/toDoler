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
    expect(createApp()).toBeTruthy();
  });
  it(`should have as title 'toDoler'`, () => {
    expect(createApp().title).toEqual('toDoler');
  });
  it('should render title in a h1 tag', () => {
    expect(renderApp().querySelector('h1')!.textContent).toContain('Welcome to toDoler!');
  });
  it('should build the list out of divs rather than list elements', () => {
    const compiled = renderApp();
    expect(compiled.querySelectorAll('ul, ol, li')).toHaveLength(0);
    const items = listItems(compiled);
    expect(items.length).toBeGreaterThan(0);
    items.forEach((item) => expect(item.tagName).toEqual('DIV'));
  });
  it('should keep the list semantics the list elements carried', () => {
    const compiled = renderApp();
    const lists = compiled.querySelectorAll('div[role="list"]');
    expect(lists).toHaveLength(1);
    const items = listItems(compiled);
    expect(items.length).toBeGreaterThan(0);
    items.forEach((item) => expect(item.parentElement).toBe(lists[0]));
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

function createApp(): AppComponent {
  return TestBed.createComponent(AppComponent).componentInstance;
}

function renderApp(): HTMLElement {
  const fixture = TestBed.createComponent(AppComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function listItems(compiled: HTMLElement): HTMLElement[] {
  return Array.from(compiled.querySelectorAll('[role="listitem"]'));
}

function renderListItemTitles(): (string | null)[] {
  return listItems(renderApp()).map((item) => item.getAttribute('title'));
}
