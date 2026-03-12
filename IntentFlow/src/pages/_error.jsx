function Error({ statusCode }) {
  return (
    <div style={{ padding: '50px', textAlign: 'center' }}>
      <h1>Error {statusCode}</h1>
      <p>Something went wrong. Check the console for details.</p>
    </div>
  );
}

Error.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;