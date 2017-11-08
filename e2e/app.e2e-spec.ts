import { CryptographicNoisePage } from './app.po';

describe('cryptographic-noise App', () => {
  let page: CryptographicNoisePage;

  beforeEach(() => {
    page = new CryptographicNoisePage();
  });

  it('should display welcome message', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('Welcome to app!!');
  });
});
