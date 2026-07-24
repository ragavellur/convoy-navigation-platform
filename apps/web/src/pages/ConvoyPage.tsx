import { useState } from 'react'

function ConvoyPage() {
  const [convoys] = useState([
    { id: '1', name: 'Alpha Convoy', code: 'ALPHA1', members: 5, status: 'active' },
    { id: '2', name: 'Bravo Team', code: 'BRAVO2', members: 3, status: 'active' },
  ])

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Convoys</h1>
        <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
          Create Convoy
        </button>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          {convoys.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No convoys yet. Create or join one to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {convoys.map((convoy) => (
                <div
                  key={convoy.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{convoy.name}</h3>
                      <p className="text-sm text-gray-500">Code: {convoy.code}</p>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {convoy.status}
                    </span>
                  </div>
                  <div className="mt-2">
                    <p className="text-sm text-gray-600">{convoy.members} members</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Join a Convoy</h2>
          <div className="flex space-x-3">
            <input
              type="text"
              placeholder="Enter convoy code"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
              Join
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConvoyPage
