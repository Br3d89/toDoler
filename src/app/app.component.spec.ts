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
  it('should build the list out of divs rather than list elements', () => {
    const compiled = render();
    expect(compiled.querySelectorAll('li')).toHaveLength(0);
    expect(compiled.querySelectorAll('ul')).toHaveLength(0);
    expect(listItems(compiled).length).toBeGreaterThan(0);
    listItems(compiled).forEach((item) => expect(item.tagName).toEqual('DIV'));
  });
  it('should keep the list semantics the list elements carried', () => {
    const compiled = render();
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

function render(): HTMLElement {
  const fixture = TestBed.createComponent(AppComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function listItems(compiled: HTMLElement): HTMLElement[] {
  return Array.from(compiled.querySelectorAll('[role="listitem"]'));
}

function renderListItemTitles(): (string | null)[] {
  return listItems(render()).map((item) => item.getAttribute('title'));
}
